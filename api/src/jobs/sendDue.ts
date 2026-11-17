import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { MAX_DAILY_SEND_LIMIT, getSettings } from "../lib/settings.js";
import { karachiDayRange } from "../lib/time.js";
import { GmailNotConnectedError, isGmailConnected, sendEmail } from "../services/gmail/mailer.js";
import { randomDelayMs, safeErrorMessage } from "./util.js";

export interface SendDueResult {
  processed: number;
  sent: number;
  failed: number;
  skippedDueToLimit: number;
  remainingToday: number;
}

const STALE_SENDING_MS = 10 * 60 * 1000;
const STOP_STATUSES = new Set(["REPLIED", "INTERESTED", "DECLINED"]);
/** Due follow-ups of stopped professors are cancelled while looking for the one email to send. */
const MAX_CANDIDATES_PER_USER = 20;

function stopReason(status: string): string {
  return status === "REPLIED" ? "Professor already replied" : `Professor marked ${status.toLowerCase()}`;
}

let running = false;
/** Users already warned about (due emails but no Gmail), so the log isn't spammed every minute. */
const loggedNotConnected = new Set<string>();

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

/** In-Reply-To / References for a follow-up: parent's Message-ID and the thread chain, oldest first. */
async function threadingFor(email: {
  userId: string;
  followUpNo: number;
  parentId: string | null;
  gmailThreadId: string | null;
}) {
  if (email.followUpNo <= 0 || !email.gmailThreadId) return {};
  const chain = await prisma.email.findMany({
    where: { userId: email.userId, gmailThreadId: email.gmailThreadId, status: "SENT", messageIdHeader: { not: null } },
    orderBy: { sentAt: "asc" },
    select: { id: true, messageIdHeader: true },
  });
  const references = chain.map((c) => c.messageIdHeader ?? "").filter(Boolean);
  const parent = email.parentId ? chain.find((c) => c.id === email.parentId) : undefined;
  const inReplyTo = parent?.messageIdHeader ?? references[references.length - 1] ?? null;
  return { threadId: email.gmailThreadId, inReplyTo, references };
}

/**
 * One user's share of a tick: respects their daily limit (Karachi day) and spacing (nextSendAfter),
 * and sends at most ONE email. Never sleeps.
 */
async function sendDueForUser(userId: string, now: Date, clock: () => Date, result: SendDueResult): Promise<void> {
  const dueWhere = { userId, status: "SCHEDULED" as const, scheduledAt: { lte: now } };
  // Cancel due emails for stopped professors first, so they leave the queue even when the user has no capacity left.
  for (const status of STOP_STATUSES) {
    await prisma.email.updateMany({
      where: { ...dueWhere, professor: { status: status as "REPLIED" | "INTERESTED" | "DECLINED" } },
      data: { status: "CANCELLED", error: stopReason(status) },
    });
  }
  const [settings, sentToday, dueCount] = await Promise.all([
    getSettings(userId),
    prisma.email.count({ where: { userId, status: "SENT", sentAt: karachiDayRange(now) } }),
    prisma.email.count({ where: dueWhere }),
  ]);
  if (dueCount === 0) return;
  const limit = Math.min(settings.dailySendLimit, MAX_DAILY_SEND_LIMIT);
  let remaining = Math.max(0, limit - sentToday);

  if (!env.DRY_RUN && !(await isGmailConnected(userId))) {
    if (!loggedNotConnected.has(userId)) {
      console.warn(`[send-due] user ${userId}: ${dueCount} email(s) due but Gmail is not connected; leaving them SCHEDULED`);
      loggedNotConnected.add(userId);
    }
    return;
  }
  loggedNotConnected.delete(userId);

  result.skippedDueToLimit += Math.max(0, dueCount - remaining);
  if (remaining === 0) return;
  if (settings.nextSendAfter && settings.nextSendAfter.getTime() > now.getTime()) {
    result.remainingToday += remaining;
    return;
  }

  const candidates = await prisma.email.findMany({
    where: dueWhere,
    orderBy: { scheduledAt: "asc" },
    take: MAX_CANDIDATES_PER_USER,
    include: { professor: { select: { id: true, email: true, status: true } } },
  });

  for (const email of candidates) {
    const claim = await prisma.email.updateMany({
      where: { id: email.id, userId, status: "SCHEDULED" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) continue;
    result.processed++;

    // Fresh professor status (may have changed since the query).
    const prof = await prisma.professor.findFirst({ where: { id: email.professorId, userId }, select: { status: true } });
    // Hold back first emails AND follow-ups once the professor replied / was marked INTERESTED or DECLINED.
    if (!prof || STOP_STATUSES.has(prof.status)) {
      await prisma.email.update({
        where: { id: email.id },
        data: { status: "CANCELLED", error: prof ? stopReason(prof.status) : "Professor not found" },
      });
      continue;
    }

    try {
      const threading = await threadingFor(email);
      // Same clock for the DB sentAt and the DRY_RUN thread store, so daily counts and reply checks agree.
      const sendTime = clock();
      const sent = await sendEmail(userId, {
        to: email.professor.email,
        subject: email.subject,
        body: email.body,
        isHtml: email.isHtml,
        sentAt: sendTime,
        ...threading,
      });
      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: "SENT",
          sentAt: sendTime,
          error: null,
          gmailMessageId: sent.gmailMessageId,
          gmailThreadId: sent.gmailThreadId,
          messageIdHeader: sent.messageIdHeader,
        },
      });
      await prisma.professor.updateMany({
        where: { id: email.professorId, userId, status: "NOT_SENT" },
        data: { status: "SENT" },
      });
      result.sent++;
      remaining--;
    } catch (err) {
      if (err instanceof GmailNotConnectedError) {
        // Disconnected mid-run: put it back, don't burn it.
        await prisma.email.updateMany({ where: { id: email.id, status: "SENDING" }, data: { status: "SCHEDULED" } });
        result.processed--;
        break;
      }
      const message = safeErrorMessage(err);
      console.error(`[send-due] email ${email.id} failed: ${message}`);
      await prisma.email
        .update({ where: { id: email.id }, data: { status: "FAILED", error: message } })
        .catch((e: unknown) => console.error(`[send-due] could not mark ${email.id} FAILED:`, safeErrorMessage(e)));
      result.failed++;
    }
    // One real attempt per user per tick; space the next one by a random 30–120 s.
    const gap = randomDelayMs(env.SEND_DELAY_MIN_MS, env.SEND_DELAY_MAX_MS);
    await prisma.settings.update({ where: { userId }, data: { nextSendAfter: new Date(clock().getTime() + gap) } });
    break;
  }
  result.remainingToday += Math.max(0, remaining);
}

export async function runSendDue(now: Date = new Date()): Promise<SendDueResult> {
  const result: SendDueResult = { processed: 0, sent: 0, failed: 0, skippedDueToLimit: 0, remainingToday: 0 };
  if (running) {
    console.log("[send-due] previous run still in progress; skipping");
    return result;
  }
  running = true;
  // Advance a (possibly simulated) clock by real elapsed time for sentAt stamps.
  const realStart = Date.now();
  const clock = () => new Date(now.getTime() + (Date.now() - realStart));
  try {
    await resetStaleSending(new Date());
    const users = await prisma.email.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: now } },
      distinct: ["userId"],
      select: { userId: true },
    });
    for (const { userId } of users) {
      try {
        await sendDueForUser(userId, now, clock, result);
      } catch (err) {
        console.error(`[send-due] user ${userId} failed: ${safeErrorMessage(err)}`);
      }
    }
    return result;
  } finally {
    running = false;
  }
}
