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

let running = false;
let loggedNotConnected = false;

/** Cancel SCHEDULED follow-ups for professors who replied or were marked INTERESTED/DECLINED. */
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

async function pickFollowUpTemplate(followUpTemplateId: string | null) {
  if (followUpTemplateId) {
    const t = await prisma.template.findUnique({ where: { id: followUpTemplateId } });
    if (t) return t;
  }
  return prisma.template.findFirst({ where: { isFollowUp: true }, orderBy: { name: "asc" } });
}

export async function runCheckReplies(now: Date = new Date()): Promise<CheckRepliesResult> {
  const result: CheckRepliesResult = { threadsChecked: 0, repliesFound: 0, followUpsCreated: 0, followUpsCancelled: 0 };
  if (running) {
    console.log("[check-replies] previous run still in progress; skipping");
    return result;
  }
  running = true;
  try {
    result.followUpsCancelled += await cancelFollowUpsForStoppedProfessors();

    if (!env.DRY_RUN && !(await isGmailConnected())) {
      if (!loggedNotConnected) {
        console.warn("[check-replies] Gmail is not connected; skipping reply checks");
        loggedNotConnected = true;
      }
      return result;
    }
    loggedNotConnected = false;

    const settings = await getSettings();
    const sent = await prisma.email.findMany({
      where: { status: "SENT", gmailThreadId: { not: null } },
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
    // One reader (one IMAP connection for app-password accounts) for the whole run, opened lazily.
    // Every thread's work below is inside its own try/catch, so the close() after the loop always runs.
    let reader: ThreadReader | null = null;

    for (const [threadId, emails] of threads) {
      if (emails.some((e) => e.repliedAt)) continue;
      const head = emails[emails.length - 1]!; // latest SENT (ordered by sentAt asc)
      const root = emails.find((e) => e.followUpNo === 0) ?? emails[0]!;
      const professor = head.professor;
      const firstSentAt = emails[0]!.sentAt ?? head.sentAt ?? now;
      try {
        result.threadsChecked++;
        reader ??= await createThreadReader();
        const messages = await reader.getThreadMessages(threadId);
        const profAddr = professor.email.trim().toLowerCase();
        const reply = messages.find(
          (m) => parseFromAddress(m.from) === profAddr && m.date.getTime() > firstSentAt.getTime(),
        );

        if (reply) {
          result.repliesFound++;
          await prisma.$transaction([
            prisma.email.updateMany({
              where: { gmailThreadId: threadId, status: "SENT", repliedAt: null },
              data: { repliedAt: reply.date },
            }),
            prisma.professor.updateMany({
              where: { id: professor.id, status: { notIn: ["INTERESTED", "DECLINED"] } },
              data: { status: "REPLIED" },
            }),
          ]);
          const c = await prisma.email.updateMany({
            where: { professorId: professor.id, status: "SCHEDULED", followUpNo: { gt: 0 } },
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

        if (template === undefined) template = await pickFollowUpTemplate(settings.followUpTemplateId);
        if (!template) {
          if (!loggedNoTemplate) console.warn("[check-replies] follow-up due but no follow-up template exists; skipping");
          loggedNoTemplate = true;
          continue;
        }
        const body = renderTemplate(template.body, {
          name: professor.name,
          university: professor.university,
          researchFocus: professor.researchFocus,
          whyFits: professor.whyFits,
        }, { html: template.isHtml });
        await prisma.email.create({
          data: {
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
        console.error(`[check-replies] thread ${threadId} failed: ${safeErrorMessage(err)}`);
      }
    }
    if (reader) await (reader as ThreadReader).close().catch(() => undefined);
    return result;
  } finally {
    running = false;
  }
}
