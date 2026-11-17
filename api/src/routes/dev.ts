import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../lib/env.js";
import { HttpError, validateBody } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { appendDryRunMessage, getDryRunThread } from "../services/gmail/dryRunStore.js";

/** Mounted only when DRY_RUN (see routes/index.ts); each handler re-checks as defence in depth. */
export const devRouter = Router();

const simulateSchema = z.object({
  emailId: z.string().min(1),
  from: z.string().min(3).max(320).optional(),
  at: z.iso.datetime({ offset: true }).optional(),
});

devRouter.post("/simulate-reply", validateBody(simulateSchema), async (req, res) => {
  if (!env.DRY_RUN) throw new HttpError(404, "Not found");
  const body = req.body as z.infer<typeof simulateSchema>;
  const email = await prisma.email.findUnique({ where: { id: body.emailId }, include: { professor: true } });
  if (!email) throw new HttpError(404, "Email not found");
  if (email.status !== "SENT" || !email.gmailThreadId) {
    throw new HttpError(409, "Email has not been sent (no thread to reply to)");
  }
  const threadId = email.gmailThreadId;

  let at: Date;
  if (body.at) {
    at = new Date(body.at);
  } else {
    // Default: now, but never before the latest message in the thread / the send time (+1 min),
    // so it is detected even when send-due was driven with a simulated future `now`.
    const thread = await getDryRunThread(threadId);
    const latest = Math.max(
      email.sentAt?.getTime() ?? 0,
      ...thread.map((m) => new Date(m.date).getTime()).filter(Number.isFinite),
    );
    at = new Date(Math.max(Date.now(), latest + 60_000));
  }

  await appendDryRunMessage(threadId, {
    direction: "inbound",
    from: body.from?.trim() || `${email.professor.name} <${email.professor.email}>`,
    subject: email.subject.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject}`,
    date: at.toISOString(),
    messageIdHeader: `<dry-reply-${randomBytes(8).toString("hex")}@prof-mailer.local>`,
  });
  res.json({ ok: true, threadId });
});
