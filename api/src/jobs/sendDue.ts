import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { getSettings } from "../lib/settings.js";
import { startOfKarachiDay } from "../lib/time.js";
import { GmailNotConnectedError, isGmailConnected, sendEmail } from "../services/gmail/mailer.js";
import { randomDelayMs, safeErrorMessage, sleep } from "./util.js";

export interface SendDueResult {
  processed: number;
  sent: number;
  failed: number;
  skippedDueToLimit: number;
  remainingToday: number;
}

const STALE_SENDING_MS = 10 * 60 * 1000;
const STOP_STATUSES = new Set(["REPLIED", "INTERESTED", "DECLINED"]);

let running = false;
let loggedNotConnected = false;

/**
 * SENDING rows older than 10 min were interrupted (crash, or DB update failed after Gmail accepted it).
 * The email may already have been delivered, so never auto-retry: mark FAILED for manual review
 * (the user can check Gmail "Sent" and reschedule from the queue if it really didn't go out).
 */
export async function resetStaleSending(now: Date = new Date()): Promise<number> {
  const r = await prisma.email.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
    data: {
      status: "FAILED",
      error: "Interrupted while sending - it may already have been delivered. Check Gmail Sent before rescheduling.",
    },
  });
  if (r.count > 0) console.warn(`[send-due] marked ${r.count} interrupted SENDING email(s) as FAILED for review`);
  return r.count;
}

async function sentTodayCount(now: Date): Promise<number> {
  return prisma.email.count({ where: { status: "SENT", sentAt: { gte: startOfKarachiDay(now) } } });
}

/** In-Reply-To / References for a follow-up: parent's Message-ID and the thread chain, oldest first. */
async function threadingFor(email: { followUpNo: number; parentId: string | null; gmailThreadId: string | null }) {
  if (email.followUpNo <= 0 || !email.gmailThreadId) return {};
  const chain = await prisma.email.findMany({
    where: { gmailThreadId: email.gmailThreadId, status: "SENT", messageIdHeader: { not: null } },
    orderBy: { sentAt: "asc" },
    select: { id: true, messageIdHeader: true },
  });
  const references = chain.map((c) => c.messageIdHeader ?? "").filter(Boolean);
  const parent = email.parentId ? chain.find((c) => c.id === email.parentId) : undefined;
  const inReplyTo = parent?.messageIdHeader ?? references[references.length - 1] ?? null;
  return { threadId: email.gmailThreadId, inReplyTo, references };
}

export async function runSendDue(now: Date = new Date()): Promise<SendDueResult> {
  const empty: SendDueResult = { processed: 0, sent: 0, failed: 0, skippedDueToLimit: 0, remainingToday: 0 };
  if (running) {
    console.log("[send-due] previous run still in progress; skipping");
    return empty;
  }
  running = true;
  // Advance a (possibly simulated) clock by real elapsed time for sentAt stamps.
  const realStart = Date.now();
  const clock = () => new Date(now.getTime() + (Date.now() - realStart));
  try {
    await resetStaleSending(new Date());
    const settings = await getSettings();
    let remaining = Math.max(0, settings.dailySendLimit - (await sentTodayCount(now)));

    const dueWhere = { status: "SCHEDULED" as const, scheduledAt: { lte: now } };
    const dueCount = await prisma.email.count({ where: dueWhere });
    const result: SendDueResult = { ...empty, remainingToday: remaining };
    if (dueCount === 0) return result;

    if (!env.DRY_RUN && !(await isGmailConnected())) {
      if (!loggedNotConnected) {
        console.warn(`[send-due] ${dueCount} email(s) due but Gmail is not connected; leaving them SCHEDULED`);
        loggedNotConnected = true;
      }
      return result;
    }
    loggedNotConnected = false;

    result.skippedDueToLimit = Math.max(0, dueCount - remaining);
    if (remaining === 0) return result;

    const due = await prisma.email.findMany({
      where: dueWhere,
      orderBy: { scheduledAt: "asc" },
      take: remaining,
      include: { professor: { select: { id: true, email: true, status: true } } },
    });

    let attempted = false;
    for (const email of due) {
      const claim = await prisma.email.updateMany({
        where: { id: email.id, status: "SCHEDULED" },
        data: { status: "SENDING" },
      });
      if (claim.count === 0) continue;
      result.processed++;

      // Fresh professor status (may have changed since the query).
      const prof = await prisma.professor.findUnique({ where: { id: email.professorId }, select: { status: true } });
      if (email.followUpNo > 0 && (!prof || STOP_STATUSES.has(prof.status))) {
        await prisma.email.update({ where: { id: email.id }, data: { status: "CANCELLED" } });
        continue;
      }

      if (attempted) await sleep(randomDelayMs(env.SEND_DELAY_MIN_MS, env.SEND_DELAY_MAX_MS));
      attempted = true;

      try {
        const threading = await threadingFor(email);
        const sent = await sendEmail({
          to: email.professor.email,
          subject: email.subject,
          body: email.body,
          isHtml: email.isHtml,
          ...threading,
        });
        await prisma.email.update({
          where: { id: email.id },
          data: {
            status: "SENT",
            sentAt: clock(),
            error: null,
            gmailMessageId: sent.gmailMessageId,
            gmailThreadId: sent.gmailThreadId,
            messageIdHeader: sent.messageIdHeader,
          },
        });
        await prisma.professor.updateMany({
          where: { id: email.professorId, status: "NOT_SENT" },
          data: { status: "SENT" },
        });
        result.sent++;
        remaining--;
      } catch (err) {
        if (err instanceof GmailNotConnectedError) {
          // Disconnected mid-run: put it back, don't burn it.
          await prisma.email.updateMany({ where: { id: email.id, status: "SENDING" }, data: { status: "SCHEDULED" } });
          result.processed--;
          console.warn("[send-due] Gmail disconnected during run; stopping");
          break;
        }
        const message = safeErrorMessage(err);
        console.error(`[send-due] email ${email.id} failed: ${message}`);
        await prisma.email
          .update({ where: { id: email.id }, data: { status: "FAILED", error: message } })
          .catch((e: unknown) => console.error(`[send-due] could not mark ${email.id} FAILED:`, safeErrorMessage(e)));
        result.failed++;
      }
    }
    result.remainingToday = Math.max(0, remaining);
    return result;
  } finally {
    running = false;
  }
}
