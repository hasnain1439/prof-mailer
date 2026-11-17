/** Pure helpers for Gmail app-password connections (no env / prisma imports, unit-testable). */

/**
 * Google shows app passwords as four groups of four letters ("abcd efgh ijkl mnop").
 * Strip all whitespace (including non-breaking spaces from copy/paste) and lowercase.
 * Returns null unless exactly 16 ASCII letters remain.
 */
export function normalizeAppPassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/[\s  -​  　-]+/g, "").toLowerCase();
  return /^[a-z]{16}$/.test(v) ? v : null;
}

/** Fallback thread id stored when Gmail's X-GM-THRID could not be looked up after an SMTP send. */
export const SMTP_THREAD_PREFIX = "smtp-";

export function smtpFallbackThreadId(messageIdHeader: string): string {
  return `${SMTP_THREAD_PREFIX}${messageIdHeader}`;
}

/** The Message-ID (with angle brackets) behind a fallback thread id, or null for a real Gmail thread id. */
export function messageIdFromFallbackThreadId(threadId: string): string | null {
  return threadId.startsWith(SMTP_THREAD_PREFIX) ? threadId.slice(SMTP_THREAD_PREFIX.length) : null;
}

/**
 * Gmail thread ids come in two spellings of the same 64-bit number: the Gmail API uses hex
 * ("18c2f0a1b2c3d4e5", 16 chars), IMAP X-GM-THRID uses decimal (~19 digits). Converting lets
 * emails sent under one connection type still be checked for replies after switching to the other.
 */
export function toImapThreadId(threadId: string): string | null {
  if (/^[0-9a-f]{16}$/i.test(threadId)) return BigInt(`0x${threadId}`).toString(10);
  if (/^\d{1,20}$/.test(threadId)) return threadId;
  return null;
}

export function toApiThreadId(threadId: string): string {
  return /^\d{17,20}$/.test(threadId) ? BigInt(threadId).toString(16) : threadId;
}
