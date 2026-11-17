/**
 * Gmail via address + Google App Password: SMTP (smtp.gmail.com:465) to send, IMAP
 * (imap.gmail.com:993) to read Sent / All Mail for thread ids and replies.
 *
 * The app password is stored AES-256-GCM encrypted (lib/crypto.ts). Never log it, return it or put
 * it in an error message: errors from nodemailer / imapflow are mapped to fixed messages here.
 */
import { ImapFlow, type FetchMessageObject } from "imapflow";
import nodemailer from "nodemailer";
import { decryptSecret, encryptSecret } from "../../lib/crypto.js";
import { HttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { htmlToText } from "../../lib/template.js";
import {
  messageIdFromFallbackThreadId,
  smtpFallbackThreadId,
  toImapThreadId,
} from "./appPasswordFormat.js";
import { generateMessageId, isSingleAddress, sanitizeHeaderValue } from "./mime.js";

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const IMAP_HOST = "imap.gmail.com";
const IMAP_PORT = 993;
const TIMEOUT_MS = 15_000;

export const AUTH_FAILED_MESSAGE =
  "Gmail rejected the login. Make sure 2-Step Verification is on and you used an App Password, not your normal password.";

export interface AppPasswordCreds {
  email: string;
  password: string;
}

export interface ThreadMessageLike {
  from: string;
  date: Date;
  messageIdHeader?: string;
}

// ---------------------------------------------------------------------------------------------
// error mapping (no secrets ever leave this module)

function isAuthError(err: unknown): boolean {
  const e = err as { code?: unknown; responseCode?: unknown; authenticationFailed?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (e.authenticationFailed === true) return true;
  if (e.code === "EAUTH") return true;
  return e.responseCode === 535 || e.responseCode === 534;
}

/** Short, secret-free description of a network / protocol error. */
function describeError(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: unknown } | null;
  const code = e && typeof e.code === "string" ? e.code : null;
  const rc = e && typeof e.responseCode === "number" ? e.responseCode : null;
  if (code === "ETIMEDOUT" || code === "ETIMEOUT" || code === "CONNECTION_TIMEOUT" || code === "GreetingTimeout")
    return "timed out";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS lookup failed";
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return "connection refused/reset";
  if (code) return `error ${code}${rc ? ` (${rc})` : ""}`;
  if (rc) return `server responded ${rc}`;
  return "unexpected error";
}

/** Error safe to log / store: never contains the password. */
export class AppPasswordError extends Error {
  constructor(
    message: string,
    public readonly authFailed = false,
  ) {
    super(message);
  }
}

function wrap(stage: "SMTP" | "IMAP", err: unknown): AppPasswordError {
  if (err instanceof AppPasswordError) return err;
  if (isAuthError(err)) return new AppPasswordError(`${stage}: ${AUTH_FAILED_MESSAGE}`, true);
  return new AppPasswordError(`Gmail ${stage} ${describeError(err)}`);
}

// ---------------------------------------------------------------------------------------------
// transports

function smtpTransport(creds: AppPasswordCreds) {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: creds.email, pass: creds.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: 60_000,
    logger: false,
    debug: false,
  });
}

function imapClient(creds: AppPasswordCreds): ImapFlow {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: 60_000,
  });
  // Without a listener an async socket error would crash the process.
  client.on("error", () => undefined);
  return client;
}

/** Connect, run fn, always log out. Errors are mapped to AppPasswordError. */
export async function withImap<T>(creds: AppPasswordCreds, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = imapClient(creds);
  try {
    await client.connect();
  } catch (err) {
    throw wrap("IMAP", err);
  }
  try {
    return await fn(client);
  } catch (err) {
    throw wrap("IMAP", err);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Path of the mailbox with a special-use flag (\Sent, \All); falls back to Gmail's English names. */
async function specialMailbox(client: ImapFlow, use: "\\Sent" | "\\All"): Promise<string> {
  const boxes = await client.list();
  const hit = boxes.find((b) => b.specialUse === use);
  if (hit) return hit.path;
  const suffix = use === "\\Sent" ? "Sent Mail" : "All Mail";
  const byName = boxes.find((b) => /^\[(Gmail|Google Mail)\]\//.test(b.path) && b.path.endsWith(`/${suffix}`));
  if (byName) return byName.path;
  throw new AppPasswordError(`Gmail IMAP: could not find the "${suffix}" folder (is it hidden from IMAP in Gmail settings?)`);
}

// ---------------------------------------------------------------------------------------------
// connect

/** Verify SMTP and IMAP logins, then store the user's GmailAccount. Throws HttpError. */
export async function connectWithAppPassword(userId: string, rawEmail: string, password: string): Promise<{ email: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!isSingleAddress(email)) throw new HttpError(400, "Enter a valid Gmail address");
  const creds = { email, password };

  const smtp = smtpTransport(creds);
  try {
    await smtp.verify();
  } catch (err) {
    const e = wrap("SMTP", err);
    if (e.authFailed) throw new HttpError(400, AUTH_FAILED_MESSAGE);
    throw new HttpError(502, `Could not reach ${SMTP_HOST}: ${e.message}`);
  } finally {
    smtp.close();
  }

  try {
    await withImap(creds, async () => undefined);
  } catch (err) {
    const e = err instanceof AppPasswordError ? err : wrap("IMAP", err);
    if (e.authFailed) throw new HttpError(400, AUTH_FAILED_MESSAGE);
    throw new HttpError(
      502,
      `Sending works but Gmail IMAP failed (${e.message}). Check that IMAP is enabled in Gmail settings.`,
    );
  }

  const data = {
    email,
    authType: "APP_PASSWORD" as const,
    appPasswordEnc: encryptSecret(password),
  };
  await prisma.gmailAccount.upsert({
    where: { userId },
    update: { ...data, connectedAt: new Date() },
    create: { userId, ...data },
  });
  return { email };
}

/** Decrypted credentials of the connected app-password account, or null. */
export async function getAppPasswordCreds(userId: string): Promise<AppPasswordCreds | null> {
  const account = await prisma.gmailAccount.findUnique({ where: { userId } });
  if (!account || account.authType !== "APP_PASSWORD" || !account.appPasswordEnc) return null;
  return { email: account.email, password: decryptSecret(account.appPasswordEnc) };
}

// ---------------------------------------------------------------------------------------------
// send

export interface SmtpSendInput {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
  /** Existing thread (follow-up): kept as-is, no lookup needed. */
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
}

export async function sendViaSmtp(
  creds: AppPasswordCreds,
  input: SmtpSendInput,
): Promise<{ gmailMessageId: string; gmailThreadId: string; messageIdHeader: string }> {
  const messageIdHeader = generateMessageId(creds.email);
  const refs = (input.references ?? []).map(sanitizeHeaderValue).filter(Boolean);
  const transport = smtpTransport(creds);
  try {
    await transport.sendMail({
      from: creds.email,
      to: input.to,
      subject: sanitizeHeaderValue(input.subject),
      text: input.isHtml ? htmlToText(input.body) : input.body,
      ...(input.isHtml ? { html: input.body } : {}),
      messageId: messageIdHeader,
      date: new Date(),
      ...(input.inReplyTo ? { inReplyTo: sanitizeHeaderValue(input.inReplyTo) } : {}),
      ...(refs.length ? { references: refs } : {}),
    });
  } catch (err) {
    throw wrap("SMTP", err);
  } finally {
    transport.close();
  }

  // Follow-ups stay in the thread id the root email was stored under.
  if (input.threadId) return { gmailMessageId: messageIdHeader, gmailThreadId: input.threadId, messageIdHeader };

  let found: { threadId: string; emailId?: string } | null = null;
  try {
    found = await lookupSentMessage(creds, messageIdHeader);
  } catch (err) {
    console.warn(`[gmail-smtp] thread id lookup failed: ${wrap("IMAP", err).message}`);
  }
  if (!found) {
    console.warn("[gmail-smtp] Gmail thread id not found yet; using Message-ID fallback for reply detection");
    return { gmailMessageId: messageIdHeader, gmailThreadId: smtpFallbackThreadId(messageIdHeader), messageIdHeader };
  }
  return { gmailMessageId: found.emailId ?? messageIdHeader, gmailThreadId: found.threadId, messageIdHeader };
}

/** Find our just-sent message in Sent Mail by Message-ID and return its X-GM-THRID. Retries ~5 s. */
async function lookupSentMessage(
  creds: AppPasswordCreds,
  messageIdHeader: string,
): Promise<{ threadId: string; emailId?: string } | null> {
  return withImap(creds, async (client) => {
    const sent = await specialMailbox(client, "\\Sent");
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1_500));
      const lock = await client.getMailboxLock(sent, { readOnly: true });
      try {
        const msg = await findByMessageId(client, messageIdHeader);
        if (msg?.threadId) return { threadId: msg.threadId, ...(msg.emailId ? { emailId: msg.emailId } : {}) };
      } finally {
        lock.release();
      }
    }
    return null;
  });
}

async function findByMessageId(client: ImapFlow, messageIdHeader: string): Promise<FetchMessageObject | null> {
  const uids = await client.search({ header: { "message-id": messageIdHeader } }, { uid: true });
  if (!uids || uids.length === 0) return null;
  const msgs = await client.fetchAll(uids, { uid: true, threadId: true }, { uid: true });
  return msgs.find((m) => m.threadId) ?? null;
}

// ---------------------------------------------------------------------------------------------
// read threads

function formatFrom(m: FetchMessageObject): string {
  const a = m.envelope?.from?.[0];
  if (!a?.address) return "";
  return a.name ? `${a.name} <${a.address}>` : a.address;
}

function toThreadMessage(m: FetchMessageObject): ThreadMessageLike {
  const valid = (d: Date | string | undefined) => {
    const x = d ? new Date(d) : null;
    return x && !Number.isNaN(x.getTime()) ? x : null;
  };
  // Prefer the receipt time (INTERNALDATE); fall back to the Date header.
  const date = valid(m.internalDate) ?? valid(m.envelope?.date) ?? new Date(0);
  const mid = m.envelope?.messageId;
  return { from: formatFrom(m), date, ...(mid ? { messageIdHeader: mid } : {}) };
}

/**
 * Reads threads over one IMAP connection with All Mail open. Use for a whole check-replies run,
 * then close().
 */
export class ImapThreadReader {
  private client: ImapFlow | null = null;
  private allMail: string | null = null;

  constructor(private readonly creds: AppPasswordCreds) {}

  private async open(): Promise<ImapFlow> {
    if (this.client?.usable) return this.client;
    this.client = imapClient(this.creds);
    try {
      await this.client.connect();
      this.allMail = await specialMailbox(this.client, "\\All");
    } catch (err) {
      await this.close();
      throw wrap("IMAP", err);
    }
    return this.client;
  }

  async getThreadMessages(threadId: string): Promise<ThreadMessageLike[]> {
    const client = await this.open();
    let lock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>>;
    try {
      lock = await client.getMailboxLock(this.allMail!, { readOnly: true });
    } catch (err) {
      throw wrap("IMAP", err);
    }
    try {
      let thrid = toImapThreadId(threadId);
      let uids: number[] = [];
      if (!thrid) {
        const mid = messageIdFromFallbackThreadId(threadId);
        if (!mid) throw new AppPasswordError("Unrecognised thread id format");
        // Gmail may have indexed it since: resolve the real thread id first.
        const own = await findByMessageId(client, mid);
        if (own?.threadId) thrid = own.threadId;
        else {
          const found = await client.search(
            { or: [{ header: { "in-reply-to": mid } }, { header: { references: mid } }] },
            { uid: true },
          );
          uids = found || [];
        }
      }
      if (thrid) uids = (await client.search({ threadId: thrid }, { uid: true })) || [];
      if (uids.length === 0) return [];
      const msgs = await client.fetchAll(uids, { uid: true, envelope: true, internalDate: true }, { uid: true });
      return msgs.map(toThreadMessage).sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (err) {
      throw wrap("IMAP", err);
    } finally {
      lock.release();
    }
  }

  async close(): Promise<void> {
    const c = this.client;
    this.client = null;
    if (c) await c.logout().catch(() => c.close());
  }
}
