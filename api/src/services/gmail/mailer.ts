/**
 * The ONE place that sends email. In DRY_RUN nothing leaves the process: the message is logged
 * and recorded in the dry-run thread store.
 *
 * Callers: sendTestEmail (recipient forced to TEST_RECIPIENT) and the send-due job (professor address).
 */
import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/http.js";
import { htmlToText } from "../../lib/template.js";
import { appendDryRunMessage, getDryRunThread } from "./dryRunStore.js";
import { buildMimeMessage, generateMessageId, isSingleAddress, toBase64Url } from "./mime.js";
import { getAuthorizedClient, getGmailAccount } from "./oauth.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** body is HTML: send multipart/alternative with an auto-generated text part. */
  isHtml?: boolean;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
}

export interface SendEmailResult {
  gmailMessageId: string;
  gmailThreadId: string;
  messageIdHeader: string;
  dryRun: boolean;
}

export interface ThreadMessage {
  from: string;
  date: Date;
  messageIdHeader?: string;
}

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Gmail account is not connected");
  }
}

const DRY_FROM_FALLBACK = "me@prof-mailer.local";

function rand(): string {
  return randomBytes(8).toString("hex");
}

/** True when a real (non-dry-run) send could happen right now. */
export async function isGmailConnected(): Promise<boolean> {
  return (await getAuthorizedClient()) !== null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = input.to.trim().toLowerCase();
  if (!isSingleAddress(to)) throw new Error("Invalid recipient address");

  if (env.DRY_RUN) {
    const account = await getGmailAccount().catch(() => null);
    const from = account?.email ?? DRY_FROM_FALLBACK;
    const gmailThreadId = input.threadId || `dry-thread-${rand()}`;
    const messageIdHeader = `<dry-${rand()}@prof-mailer.local>`;
    const preview = (input.isHtml ? htmlToText(input.body) : input.body).replace(/\s+/g, " ").trim().slice(0, 80);
    console.log(
      `[DRY_RUN] would send to=${to} subject=${JSON.stringify(input.subject)} threadId=${input.threadId ?? "(new)"} ` +
        `body="${preview}${input.body.length > 80 ? "…" : ""}"`,
    );
    await appendDryRunMessage(gmailThreadId, {
      direction: "outbound",
      from,
      to,
      subject: input.subject,
      date: new Date().toISOString(),
      messageIdHeader,
    });
    return { gmailMessageId: `dry-msg-${rand()}`, gmailThreadId, messageIdHeader, dryRun: true };
  }

  const auth = await getAuthorizedClient();
  if (!auth) throw new GmailNotConnectedError();
  const gmail = google.gmail({ version: "v1", auth: auth.client });

  const generatedId = generateMessageId(auth.email);
  const raw = buildMimeMessage({
    from: auth.email,
    to,
    subject: input.subject,
    body: input.isHtml ? htmlToText(input.body) : input.body,
    html: input.isHtml ? input.body : null,
    messageId: generatedId,
    date: new Date(),
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ?? null,
  });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: toBase64Url(raw), ...(input.threadId ? { threadId: input.threadId } : {}) },
  });
  const gmailMessageId = res.data.id;
  const gmailThreadId = res.data.threadId;
  if (!gmailMessageId || !gmailThreadId) throw new Error("Gmail send returned no message/thread id");

  // Gmail usually keeps our Message-ID, but read it back in case it was rewritten.
  let messageIdHeader = generatedId;
  try {
    const meta = await gmail.users.messages.get({
      userId: "me",
      id: gmailMessageId,
      format: "metadata",
      metadataHeaders: ["Message-ID"],
    });
    const h = meta.data.payload?.headers?.find((x) => x.name?.toLowerCase() === "message-id")?.value;
    if (h) messageIdHeader = h.trim();
  } catch {
    // keep the generated id
  }
  return { gmailMessageId, gmailThreadId, messageIdHeader, dryRun: false };
}

/** Manual test send. The recipient is ALWAYS env.TEST_RECIPIENT. */
export async function sendTestEmail(opts: { subject?: string; body?: string }) {
  const to = env.TEST_RECIPIENT.trim();
  if (!to) throw new HttpError(400, "TEST_RECIPIENT is not set");
  if (!isSingleAddress(to)) throw new HttpError(400, "TEST_RECIPIENT is not a valid single email address");
  if (!env.DRY_RUN && !(await isGmailConnected())) throw new HttpError(409, "Gmail is not connected");
  const subject = opts.subject?.trim() || "prof-mailer test email";
  const body =
    opts.body?.trim() || `This is a test email from prof-mailer, sent at ${new Date().toISOString()}.`;
  const r = await sendEmail({ to, subject, body });
  return { to, ...r };
}

/** Messages of a thread (oldest first). Real mode: Gmail metadata; DRY_RUN: the dry-run store. */
export async function getThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  if (env.DRY_RUN) {
    const msgs = await getDryRunThread(threadId);
    return msgs
      .map((m) => ({
        from: m.from,
        date: new Date(m.date),
        ...(m.messageIdHeader ? { messageIdHeader: m.messageIdHeader } : {}),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const auth = await getAuthorizedClient();
  if (!auth) throw new GmailNotConnectedError();
  const gmail = google.gmail({ version: "v1", auth: auth.client });
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From", "Date", "Message-ID"],
  });
  const out: ThreadMessage[] = [];
  for (const m of res.data.messages ?? []) {
    const headers = m.payload?.headers ?? [];
    const get = (n: string) => headers.find((h) => h.name?.toLowerCase() === n)?.value ?? undefined;
    // Prefer Gmail's internalDate (receipt time); fall back to the Date header.
    const internal = m.internalDate ? Number(m.internalDate) : NaN;
    const date = Number.isFinite(internal) ? new Date(internal) : new Date(get("date") ?? 0);
    const mid = get("message-id");
    out.push({ from: get("from") ?? "", date, ...(mid ? { messageIdHeader: mid } : {}) });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
