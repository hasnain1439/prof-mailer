/**
 * The ONE place that sends email to professors. In DRY_RUN nothing leaves the process: the message
 * is logged and recorded in the dry-run thread store. (System mail such as verification links goes
 * through services/mail/system.ts instead.)
 *
 * Every call is for one user and uses that user's GmailAccount (address + App Password: SMTP to
 * send, IMAP to read threads). Callers: sendTestEmail (recipient
 * forced to the signed-in user's own address) and the send-due job (professor address).
 */
import { randomBytes } from "node:crypto";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/http.js";
import { htmlToText } from "../../lib/template.js";
import { type EmailAttachment, ImapThreadReader, getAppPasswordCreds, sendViaSmtp } from "./appPassword.js";
import { appendDryRunMessage, getDryRunThread } from "./dryRunStore.js";
import { getGmailAccount } from "./account.js";
import { isSingleAddress } from "./mime.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** body is HTML: send multipart/alternative with an auto-generated text part. */
  isHtml?: boolean;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
  /** Files to attach (e.g. the user's CV). */
  attachments?: EmailAttachment[];
  /** Send time recorded in the DRY_RUN thread store (defaults to now); callers pass the same value they store as sentAt. */
  sentAt?: Date;
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

/** True when a real (non-dry-run) send could happen right now for this user. */
export async function isGmailConnected(userId: string): Promise<boolean> {
  const account = await getGmailAccount(userId);
  return Boolean(account && account.authType === "APP_PASSWORD" && account.appPasswordEnc);
}

export async function sendEmail(userId: string, input: SendEmailInput): Promise<SendEmailResult> {
  const to = input.to.trim().toLowerCase();
  if (!isSingleAddress(to)) throw new Error("Invalid recipient address");

  if (env.DRY_RUN) {
    const account = await getGmailAccount(userId).catch(() => null);
    const from = account?.email ?? DRY_FROM_FALLBACK;
    const gmailThreadId = input.threadId || `dry-thread-${rand()}`;
    const messageIdHeader = `<dry-${rand()}@prof-mailer.local>`;
    const preview = (input.isHtml ? htmlToText(input.body) : input.body).replace(/\s+/g, " ").trim().slice(0, 80);
    const inReplyTo = input.inReplyTo ?? null;
    const references = (input.references ?? []).filter(Boolean);
    console.log(
      `[DRY_RUN] user=${userId} would send to=${to} subject=${JSON.stringify(input.subject)} ` +
        `threadId=${input.threadId ?? "(new)"} inReplyTo=${inReplyTo ?? "(none)"} ` +
        `references=${references.length ? references.join(" ") : "(none)"} ` +
        `attachment=${input.attachments?.length ? input.attachments.map((a) => a.filename).join(",") : "(none)"} ` +
        `body="${preview}${input.body.length > 80 ? "…" : ""}"`,
    );
    await appendDryRunMessage(gmailThreadId, {
      direction: "outbound",
      from,
      to,
      subject: input.subject,
      date: (input.sentAt ?? new Date()).toISOString(),
      messageIdHeader,
      inReplyTo,
      references,
    });
    return { gmailMessageId: `dry-msg-${rand()}`, gmailThreadId, messageIdHeader, dryRun: true };
  }

  const creds = await getAppPasswordCreds(userId);
  if (!creds) throw new GmailNotConnectedError();
  const r = await sendViaSmtp(creds, { ...input, to });
  return { ...r, dryRun: false };
}

/** Manual test send. The recipient is ALWAYS the signed-in user's own (login) address. */
export async function sendTestEmail(userId: string, ownEmail: string, opts: { subject?: string; body?: string }) {
  const to = ownEmail.trim().toLowerCase();
  if (!isSingleAddress(to)) throw new HttpError(400, "Your account email is not a valid address");
  if (!env.DRY_RUN && !(await isGmailConnected(userId))) throw new HttpError(409, "Gmail is not connected");
  const subject = opts.subject?.trim() || "prof-mailer test email";
  const body =
    opts.body?.trim() || `This is a test email from prof-mailer, sent at ${new Date().toISOString()}.`;
  const r = await sendEmail(userId, { to, subject, body });
  return { to, ...r };
}

/** Reads threads for one user during a check-replies run; close() when done. */
export interface ThreadReader {
  getThreadMessages(threadId: string): Promise<ThreadMessage[]>;
  close(): Promise<void>;
}

async function dryRunThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  const msgs = await getDryRunThread(threadId);
  return msgs
    .map((m) => ({
      from: m.from,
      date: new Date(m.date),
      ...(m.messageIdHeader ? { messageIdHeader: m.messageIdHeader } : {}),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Thread reader for one user: DRY_RUN store, or IMAP (one connection reused for the run). */
export async function createThreadReader(userId: string): Promise<ThreadReader> {
  if (env.DRY_RUN) return { getThreadMessages: dryRunThreadMessages, close: async () => undefined };
  const creds = await getAppPasswordCreds(userId);
  if (!creds) throw new GmailNotConnectedError();
  const reader = new ImapThreadReader(creds);
  return { getThreadMessages: (id) => reader.getThreadMessages(id), close: () => reader.close() };
}
