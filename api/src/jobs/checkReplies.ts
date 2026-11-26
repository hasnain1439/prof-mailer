import { getAppState, setAppState } from "../lib/appState.js";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { getSettings } from "../lib/settings.js";
import { renderTemplate } from "../lib/template.js";
import { createThreadReader, isGmailConnected, type ThreadReader } from "../services/gmail/mailer.js";
import { parseFromAddress } from "../services/gmail/mime.js";
import { sendReplyNoticeEmail, type ReplyNotice } from "../services/mail/system.js";
import { DAY_MS, followUpSubject, safeErrorMessage } from "./util.js";
import type { SenderProfile } from "../lib/template.js";
import { loadSenderProfile } from "../services/core/sender.js";

export interface CheckRepliesResult {
  threadsChecked: number;
  repliesFound: number;
  followUpsCreated: number;
  followUpsCancelled: number;
}

const LAST_CHECK_KEY = "lastReplyCheckAt";

let running = false;
const loggedNotConnected = new Set<string>();

/** Cancel SCHEDULED follow-ups for contacts who replied or were marked INTERESTED/INTERVIEW/DECLINED (all users). */
async function cancelFollowUpsForStoppedProfessors(): Promise<number> {
  const r = await prisma.email.updateMany({
    where: {
      status: "SCHEDULED",
      followUpNo: { gt: 0 },
      professor: { status: { in: ["REPLIED", "INTERESTED", "INTERVIEW", "DECLINED"] } },
    },
    data: { status: "CANCELLED" },
  });
  return r.count;
}

// Automatic senders that can land in a thread (bounces, delivery reports): never a reply.
const SYSTEM_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?)([+.@-]|$)/i;

/**
 * The contact's reply in a thread: a message after our first send from anyone but the user.
 * Contacts often answer from another address than the one we wrote to (a personal Gmail, a
 * different domain or a colleague), so the sender does not have to match the contact's email;
 * an exact match is still preferred.
 */
export function findReply<M extends { from: string; date: Date }>(
  messages: M[],
  contactEmail: string,
  ownAddresses: ReadonlySet<string>,
  firstSentAt: Date,
): M | undefined {
  const contact = contactEmail.trim().toLowerCase();
  const candidates = messages.filter((m) => {
    const from = parseFromAddress(m.from);
    return from !== "" && !ownAddresses.has(from) && !SYSTEM_SENDER.test(from) && m.date.getTime() > firstSentAt.getTime();
  });
  return candidates.find((m) => parseFromAddress(m.from) === contact) ?? candidates[0];
}

/** First existing template among the preferred ids, else any follow-up template. */
async function pickFollowUpTemplate(userId: string, preferredIds: (string | null)[]) {
  for (const id of preferredIds) {
    if (!id) continue;
    const t = await prisma.template.findFirst({ where: { id, userId } });
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
  // The user's own addresses: their messages in a thread are not replies.
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, gmailAccount: { select: { email: true } } },
  });
  const ownAddresses = new Set(
    [account?.email, account?.gmailAccount?.email].filter((a): a is string => !!a).map((a) => a.trim().toLowerCase()),
  );
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

  // Follow-up template per contact kind (companies prefer companyFollowUpTemplateId), resolved lazily.
  const templates = new Map<string, Awaited<ReturnType<typeof pickFollowUpTemplate>>>();
  let loggedNoTemplate = false;
  // One reader per user (one Gmail client / IMAP connection), opened lazily and closed after the loop.
  let reader: ThreadReader | null = null;
  // Replies found in this run, emailed to the user once at the end.
  const notices: ReplyNotice[] = [];
  // Sender profile for follow-up templates, loaded on first use.
  let sender: SenderProfile | undefined;

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
        // In the thread from anyone but the user; else a new email (not a Reply) from the contact's address.
        const reply =
          findReply(messages, professor.email, ownAddresses, firstSentAt) ??
          findReply(await reader.getMessagesFrom(professor.email, firstSentAt), professor.email, ownAddresses, firstSentAt);

        if (reply) {
          result.repliesFound++;
          await prisma.$transaction([
            prisma.email.updateMany({
              where: { userId, gmailThreadId: threadId, status: "SENT", repliedAt: null },
              data: { repliedAt: reply.date },
            }),
            prisma.professor.updateMany({
              where: { id: professor.id, userId, status: { notIn: ["INTERESTED", "INTERVIEW", "DECLINED"] } },
              data: { status: "REPLIED" },
            }),
          ]);
          const c = await prisma.email.updateMany({
            where: { userId, professorId: professor.id, status: "SCHEDULED", followUpNo: { gt: 0 } },
            data: { status: "CANCELLED" },
          });
          result.followUpsCancelled += c.count;
          notices.push({
            contactId: professor.id,
            kind: professor.kind,
            name: professor.name,
            org: professor.university,
            subject: root.subject,
          });
          continue;
        }

        // No reply: maybe schedule a follow-up.
        if (professor.status !== "SENT") continue;
        if (!head.sentAt || now.getTime() - head.sentAt.getTime() < settings.followUpAfterDays * DAY_MS) continue;
        if (head.followUpNo >= settings.maxFollowUps) continue;
        // Any existing child of the head (SCHEDULED/SENDING, or FAILED/CANCELLED by the user) blocks a new one.
        const existing = await prisma.email.count({ where: { parentId: head.id } });
        if (existing > 0) continue;

        let template = templates.get(professor.kind);
        if (template === undefined) {
          const preferred =
            professor.kind === "COMPANY"
              ? [settings.companyFollowUpTemplateId, settings.followUpTemplateId]
              : [settings.followUpTemplateId];
          template = await pickFollowUpTemplate(userId, preferred);
          templates.set(professor.kind, template);
        }
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
            role: professor.role,
            jobUrl: professor.jobUrl,
            researchFocus: professor.researchFocus,
            whyFits: professor.whyFits,
            sender: (sender ??= await loadSenderProfile(userId)),
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
            attachCv: template.attachCv,
            // Same people copied as on the first email; documents stay with the first email.
            cc: root.cc,
            bcc: root.bcc,
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

  if (notices.length > 0) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) await sendReplyNoticeEmail(user.email, notices);
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
