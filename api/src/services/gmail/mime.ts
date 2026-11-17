/**
 * Pure helpers for building RFC 5322 / MIME messages and parsing headers.
 * No env / prisma imports here so the module can be unit-tested in isolation.
 */
import { randomUUID } from "node:crypto";

const CRLF = "\r\n";

export interface MimeInput {
  from: string;
  to: string;
  subject: string;
  /** Plain-text body (always sent). */
  body: string;
  /** Optional HTML body; when set the message is multipart/alternative (text + html). */
  html?: string | null;
  messageId: string;
  date?: Date;
  inReplyTo?: string | null;
  references?: string[] | null;
}

/** Remove CR/LF (and other control chars) so a value can never inject extra headers. */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim();
}

const SIMPLE_EMAIL = /^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\]+\.[^\s@<>(),;:"\[\]\\]+$/;

/** True for a single bare address like "a.b@uni.edu" (no display name, no lists). */
export function isSingleAddress(value: string): boolean {
  return SIMPLE_EMAIL.test(value);
}

/**
 * RFC 2047 encode a header value when it contains non-ASCII characters.
 * Produces one or more =?UTF-8?B?...?= words (each <= 75 chars) folded with CRLF + space.
 */
export function encodeHeaderWord(value: string): string {
  const clean = sanitizeHeaderValue(value);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const words: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  const MAX_BYTES = 45; // 45 bytes -> 60 base64 chars; + 12 overhead = 72 <= 75
  for (const ch of clean) {
    const b = Buffer.byteLength(ch, "utf8");
    if (chunkBytes + b > MAX_BYTES && chunk) {
      words.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += b;
  }
  if (chunk) words.push(chunk);
  return words
    .map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`)
    .join(`${CRLF} `);
}

/** Base64 encode and wrap at 76 columns with CRLF. */
export function base64Wrapped(text: string): string {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join(CRLF);
}

/** RFC 5322 date, e.g. "Tue, 17 Nov 2026 04:30:00 +0000". */
export function rfc5322Date(d: Date): string {
  return d.toUTCString().replace(/GMT$/, "+0000");
}

/** Domain part of an address ("x@uni.edu" -> "uni.edu"), fallback "prof-mailer.local". */
export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  const dom = at >= 0 ? address.slice(at + 1).trim().toLowerCase() : "";
  return /^[a-z0-9.-]+$/.test(dom) && dom.length > 0 ? dom : "prof-mailer.local";
}

/** New Message-ID header value: <uuid@domain>. */
export function generateMessageId(senderAddress: string): string {
  return `<${randomUUID()}@${domainOf(senderAddress)}>`;
}

/** Normalise body line endings to CRLF. */
function toCrlf(text: string): string {
  return text.replace(/\r\n|\r|\n/g, CRLF);
}

/** Build the full RFC 5322 message (CRLF line endings). */
export function buildMimeMessage(input: MimeInput): string {
  const from = sanitizeHeaderValue(input.from);
  const to = sanitizeHeaderValue(input.to);
  if (!isSingleAddress(to)) throw new Error("Invalid recipient address");
  if (!isSingleAddress(from)) throw new Error("Invalid sender address");
  const headers: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${rfc5322Date(input.date ?? new Date())}`,
    `Message-ID: ${sanitizeHeaderValue(input.messageId)}`,
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeaderValue(input.inReplyTo)}`);
  const refs = (input.references ?? []).map(sanitizeHeaderValue).filter(Boolean);
  if (refs.length) headers.push(`References: ${refs.join(`${CRLF} `)}`);
  headers.push("MIME-Version: 1.0");
  if (!input.html) {
    headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
    return headers.join(CRLF) + CRLF + CRLF + base64Wrapped(toCrlf(input.body)) + CRLF;
  }
  const boundary = `=_pm_${randomUUID().replace(/-/g, "")}`;
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const part = (type: string, content: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", base64Wrapped(toCrlf(content))].join(CRLF);
  return (
    headers.join(CRLF) + CRLF + CRLF +
    part("text/plain", input.body) + CRLF +
    part("text/html", input.html) + CRLF +
    `--${boundary}--` + CRLF
  );
}

/** base64url (no padding) as required by gmail users.messages.send `raw`. */
export function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Extract the bare lowercase address from `"Name" <addr>`, `Name <addr>` or `addr`. */
export function parseFromAddress(from: string | null | undefined): string {
  if (!from) return "";
  const angle = /<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(from);
  if (angle) return angle[1]!.trim().toLowerCase();
  const bare = /([^\s<>"(),;:]+@[^\s<>"(),;:]+)/.exec(from);
  return bare ? bare[1]!.trim().toLowerCase() : "";
}
