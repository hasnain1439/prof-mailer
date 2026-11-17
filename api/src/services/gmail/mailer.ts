/**
 * The ONE place that sends email. In DRY_RUN nothing leaves the process: the message is logged
 * and recorded in the dry-run thread store.
 *
 * Every call is for one user and uses that user's GmailAccount. Callers: sendTestEmail (recipient
 * forced to the signed-in user's own address) and the send-due job (professor address).
 */
import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/http.js";
import { htmlToText } from "../../lib/template.js";
import { ImapThreadReader, getAppPasswordCreds, sendViaSmtp } from "./appPassword.js";
import { messageIdFromFallbackThreadId, toApiThreadId } from "./appPasswordFormat.js";
import { appendDryRunMessage, getDryRunThread } from "./dryRunStore.js";
import { buildMimeMessage, generateMessageId, isSingleAddress, toBase64Url } from "./mime.js";
import { getAuthorizedClient, getGmailAccount, type OAuth2Client } from "./oauth.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** body is HTML: send multipart/alternative with an auto-generated text part. */
  isHtml?: boolean;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
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
  if (!account) return false;
  if (account.authType === "APP_PASSWORD") return env.APP_PASSWORD_ENABLED && Boolean(account.appPasswordEnc);
  return (await getAuthorizedClient(userId)) !== null;
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

  const account = await getGmailAccount(userId);
  if (account?.authType === "APP_PASSWORD") {
    if (!env.APP_PASSWORD_ENABLED) throw new GmailNotConnectedError();
    const creds = await getAppPasswordCreds(userId);
    if (!creds) throw new GmailNotConnectedError();
    const r = await sendViaSmtp(creds, { ...input, to });
    return { ...r, dryRun: false };
  }

  const auth = await getAuthorizedClient(userId);
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
    requestBody: {
      raw: toBase64Url(raw),
      // smtp- fallback ids (sent while on an app password) are not Gmail API ids; headers thread it.
      ...(input.threadId && !messageIdFromFallbackThreadId(input.threadId)
        ? { threadId: toApiThreadId(input.threadId) }
        : {}),
    },
  });
  const gmailMessageId = res.data.id;
  // Follow-ups keep the stored thread id (it may be the IMAP/decimal or smtp- spelling) so they group with the root.
  const gmailThreadId = input.threadId || res.data.threadId;
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

/** Manual test send. The recipient is ALWAYS the signed-in user's own (Google) address. */
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

async function oauthThreadMessages(client: OAuth2Client, threadId: string): Promise<ThreadMessage[]> {
  const gmail = google.gmail({ version: "v1", auth: client });

  let apiThreadId: string | null = toApiThreadId(threadId);
  const fallbackMid = messageIdFromFallbackThreadId(threadId);
  if (fallbackMid) {
    // Sent over SMTP (app password) before switching to OAuth: resolve the thread via our Message-ID.
    const found = await gmail.users.messages.list({
      userId: "me",
      q: `rfc822msgid:${fallbackMid.replace(/[<>"\s]/g, "")}`,
      maxResults: 1,
    });
    apiThreadId = found.data.messages?.[0]?.threadId ?? null;
    if (!apiThreadId) return [];
  }

  const res = await gmail.users.threads.get({
    userId: "me",
    id: apiThreadId,
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

/**
 * Thread reader for one user: DRY_RUN store, Gmail API (OAuth, one client for the run) or IMAP
 * (app password, one connection reused for the run; only when APP_PASSWORD_ENABLED).
 */
export async function createThreadReader(userId: string): Promise<ThreadReader> {
  if (env.DRY_RUN) return { getThreadMessages: dryRunThreadMessages, close: async () => undefined };
  const account = await getGmailAccount(userId);
  if (account?.authType === "APP_PASSWORD") {
    if (!env.APP_PASSWORD_ENABLED) throw new GmailNotConnectedError();
    const creds = await getAppPasswordCreds(userId);
    if (!creds) throw new GmailNotConnectedError();
    const reader = new ImapThreadReader(creds);
    return { getThreadMessages: (id) => reader.getThreadMessages(id), close: () => reader.close() };
  }
  const auth = await getAuthorizedClient(userId);
  if (!auth) throw new GmailNotConnectedError();
  return { getThreadMessages: (id) => oauthThreadMessages(auth.client, id), close: async () => undefined };
}
