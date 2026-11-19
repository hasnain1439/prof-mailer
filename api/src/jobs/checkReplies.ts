import { getAppState, setAppState } from "../lib/appState.js";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { getSettings } from "../lib/settings.js";
import { renderTemplate } from "../lib/template.js";
import { createThreadReader, isGmailConnected, type ThreadReader } from "../services/gmail/mailer.js";
import { parseFromAddress } from "../services/gmail/mime.js";
import { DAY_MS, followUpSubject, safeErrorMessage } from "./util.js";

export interface CheckRepliesResult {
  threadsChecked: number;
  repliesFound: number;
  followUpsCreated: number;
  followUpsCancelled: number;
}

const LAST_CHECK_KEY = "lastReplyCheckAt";

let running = false;
const loggedNotConnected = new Set<string>();

/** Cancel SCHEDULED follow-ups for professors who replied or were marked INTERESTED/DECLINED (all users). */
async function cancelFollowUpsForStoppedProfessors(): Promise<number> {
  const r = await prisma.email.updateMany({
    where: {
      status: "SCHEDULED",
      followUpNo: { gt: 0 },
      professor: { status: { in: ["REPLIED", "INTERESTED", "DECLINED"] } },
    },
    data: { status: "CANCELLED" },
  });
  return r.count;
}

async function pickFollowUpTemplate(userId: string, followUpTemplateId: string | null) {
  if (followUpTemplateId) {
    const t = await prisma.template.findFirst({ where: { id: followUpTemplateId, userId } });
    if (t) return t;
  }
  return prisma.template.findFirst({ where: { userId, isFollowUp: true }, orderBy: { name: "asc" } });
}

async function checkRepliesForUser(userId: string, now: Date, result: CheckRepliesResult): Promise<void> {
  if (!env.DRY_RUN && !(await isGmailConnected(userId))) {
    if (!loggedNotConnected.has(userId)) {
      console.warn(`[check-replies] user ${userId}: Gmail is not connected; skipping reply checks`);
      loggedNotConnected.add(userId);
    }
    return;
  }
  loggedNotConnected.delete(userId);

  const settings = await getSettings(userId);
  const sent = await prisma.email.findMany({
    where: { userId, status: "SENT", gmailThreadId: { not: null } },
    orderBy: { sentAt: "asc" },
    include: { professor: true },
  });

  const threads = new Map<string, typeof sent>();
  for (const e of sent) {
    const key = e.gmailThreadId!;
    const list = threads.get(key);
    if (list) list.push(e);
    else threads.set(key, [e]);
  }

  let template: Awaited<ReturnType<typeof pickFollowUpTemplate>> | undefined;
  let loggedNoTemplate = false;
  // One reader per user (one Gmail client / IMAP connection), opened lazily and closed after the loop.
  let reader: ThreadReader | null = null;

  try {
    for (const [threadId, emails] of threads) {
      if (emails.some((e) => e.repliedAt)) continue;
      const head = emails[emails.length - 1]!; // latest SENT (ordered by sentAt asc)
      const root = emails.find((e) => e.followUpNo === 0) ?? emails[0]!;
      const professor = head.professor;
      const firstSentAt = emails[0]!.sentAt ?? head.sentAt ?? now;
      try {
        result.threadsChecked++;
        reader ??= await createThreadReader(userId);
        const messages = await reader.getThreadMessages(threadId);
        const profAddr = professor.email.trim().toLowerCase();
        const reply = messages.find(
          (m) => parseFromAddress(m.from) === profAddr && m.date.getTime() > firstSentAt.getTime(),
        );

        if (reply) {
          result.repliesFound++;
          await prisma.$transaction([
            prisma.email.updateMany({
              where: { userId, gmailThreadId: threadId, status: "SENT", repliedAt: null },
              data: { repliedAt: reply.date },
            }),
            prisma.professor.updateMany({
              where: { id: professor.id, userId, status: { notIn: ["INTERESTED", "DECLINED"] } },
              data: { status: "REPLIED" },
            }),
          ]);
          const c = await prisma.email.updateMany({
            where: { userId, professorId: professor.id, status: "SCHEDULED", followUpNo: { gt: 0 } },
            data: { status: "CANCELLED" },
          });
          result.followUpsCancelled += c.count;
          continue;
        }

        // No reply: maybe schedule a follow-up.
        if (professor.status !== "SENT") continue;
        if (!head.sentAt || now.getTime() - head.sentAt.getTime() < settings.followUpAfterDays * DAY_MS) continue;
        if (head.followUpNo >= settings.maxFollowUps) continue;
        // Any existing child of the head (SCHEDULED/SENDING, or FAILED/CANCELLED by the user) blocks a new one.
        const existing = await prisma.email.count({ where: { parentId: head.id } });
        if (existing > 0) continue;

        if (template === undefined) template = await pickFollowUpTemplate(userId, settings.followUpTemplateId);
        if (!template) {
          if (!loggedNoTemplate) {
            console.warn(`[check-replies] user ${userId}: follow-up due but no follow-up template exists; skipping`);
          }
          loggedNoTemplate = true;
          continue;
        }
        const body = renderTemplate(
          template.body,
          {
            name: professor.name,
            university: professor.university,
            researchFocus: professor.researchFocus,
            whyFits: professor.whyFits,
          },
          { html: template.isHtml },
        );
        await prisma.email.create({
          data: {
            userId,
            professorId: professor.id,
            templateId: template.id,
            subject: followUpSubject(root.subject),
            body,
            isHtml: template.isHtml,
            status: "SCHEDULED",
            scheduledAt: now,
            followUpNo: head.followUpNo + 1,
            parentId: head.id,
            gmailThreadId: threadId,
          },
        });
        result.followUpsCreated++;
      } catch (err) {
        console.error(`[check-replies] user ${userId} thread ${threadId} failed: ${safeErrorMessage(err)}`);
      }
    }
  } finally {
    if (reader) await (reader as ThreadReader).close().catch(() => undefined);
  }
}

export async function runCheckReplies(now: Date = new Date()): Promise<CheckRepliesResult> {
  const result: CheckRepliesResult = { threadsChecked: 0, repliesFound: 0, followUpsCreated: 0, followUpsCancelled: 0 };
  if (running) {
    console.log("[check-replies] previous run still in progress; skipping");
    return result;
  }
  running = true;
  try {
    await setAppState(LAST_CHECK_KEY, new Date().toISOString());
    result.followUpsCancelled += await cancelFollowUpsForStoppedProfessors();
    const users = await prisma.email.findMany({
      // Blocked users are skipped (no IMAP logins, no new follow-ups for them).
      where: { status: "SENT", gmailThreadId: { not: null }, repliedAt: null, user: { blockedAt: null } },
      distinct: ["userId"],
      select: { userId: true },
    });
    for (const { userId } of users) {
      try {
        await checkRepliesForUser(userId, now, result);
      } catch (err) {
        console.error(`[check-replies] user ${userId} failed: ${safeErrorMessage(err)}`);
      }
    }
    return result;
  } finally {
    running = false;
  }
}

/** Runs check-replies only when the last run (persisted in the DB) is at least `minGapMs` old. */
export async function maybeRunCheckReplies(minGapMs: number, now: Date = new Date()): Promise<CheckRepliesResult | null> {
  const last = await getAppState(LAST_CHECK_KEY);
  const lastMs = last ? Date.parse(last) : NaN;
  if (Number.isFinite(lastMs) && Date.now() - lastMs < minGapMs) return null;
  return runCheckReplies(now);
}
