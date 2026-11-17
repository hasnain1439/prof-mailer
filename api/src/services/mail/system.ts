/**
 * System mail (account verification, password reset) sent through the app owner's SMTP mailbox
 * (env SMTP_*, MAIL_FROM). Deliberately NOT gated by DRY_RUN: sign-up must work while professor
 * emails are still dry-run.
 *
 * Dev fallback: when SMTP is not configured (never in production, see env.ts) the message is logged
 * to the console instead, so the link can be copied. Errors are logged generically; never log
 * SMTP credentials.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../lib/env.js";

const TIMEOUT_MS = 15_000;
const APP_NAME = "prof-mailer";

let transport: Transporter | null = null;

function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
    logger: false,
    debug: false,
  });
  return transport;
}

interface SystemMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(paragraphs: string[], link?: { url: string; label: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const button = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link.url)}" style="background:#111827;color:#ffffff;` +
      `padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(link.label)}</a></p>` +
      `<p style="margin:0 0 16px;color:#6b7280;font-size:13px">Or paste this link into your browser:<br>` +
      `<span style="word-break:break-all">${escapeHtml(link.url)}</span></p>`
    : "";
  return (
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb">` +
    `<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;` +
    `padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827">` +
    `${body}${button}<p style="margin:24px 0 0;color:#6b7280;font-size:13px">${APP_NAME}</p></div></body></html>`
  );
}

/** Send or (dev without SMTP) log. Returns false on failure; never throws. */
async function deliver(msg: SystemMessage, kind: string): Promise<boolean> {
  if (!env.SMTP_CONFIGURED) {
    console.log(`[system-mail] SMTP not configured; ${kind} for ${msg.to} (not sent):\n${msg.text}`);
    return true;
  }
  try {
    await getTransport().sendMail({ from: env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    return true;
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    console.error(`[system-mail] failed to send ${kind}${typeof code === "string" ? ` (${code})` : ""}`);
    return false;
  }
}

/** Names are user-supplied (anyone can sign up with any address), so they never go into system mail. */
function greeting(_name: string | null): string {
  return "Hi,";
}

export function sendVerificationEmail(to: string, name: string | null, url: string): Promise<boolean> {
  const lines = [
    greeting(name),
    `Thanks for signing up for ${APP_NAME}. Open the link below to confirm your email address and choose your name and password.`,
    "This link expires in 24 hours. If you did not sign up, you can ignore this email.",
  ];
  return deliver(
    {
      to,
      subject: `Confirm your email for ${APP_NAME}`,
      text: `${lines[0]}\n\n${lines[1]}\n\n${url}\n\n${lines[2]}\n`,
      html: layout(lines, { url, label: "Confirm email and set password" }),
    },
    "verification email",
  );
}

export function sendPasswordResetEmail(to: string, name: string | null, url: string): Promise<boolean> {
  const lines = [
    greeting(name),
    `Someone (hopefully you) asked to reset the password for your ${APP_NAME} account.`,
    "This link expires in 1 hour. If you did not ask for this, ignore this email; your password stays the same.",
  ];
  return deliver(
    {
      to,
      subject: `Reset your ${APP_NAME} password`,
      text: `${lines[0]}\n\n${lines[1]}\n\n${url}\n\n${lines[2]}\n`,
      html: layout(lines, { url, label: "Reset password" }),
    },
    "password reset email",
  );
}

export function sendAlreadyRegisteredEmail(to: string, name: string | null, loginUrl: string, resetUrl: string): Promise<boolean> {
  const lines = [
    greeting(name),
    `Someone tried to create a new ${APP_NAME} account with this email address, but you already have one.`,
    `If that was you, sign in at ${loginUrl}. Forgot your password? Reset it at ${resetUrl}.`,
    "If it was not you, you can ignore this email.",
  ];
  return deliver(
    {
      to,
      subject: `Your ${APP_NAME} account`,
      text: lines.join("\n\n") + "\n",
      html: layout(lines),
    },
    "already-registered notice",
  );
}
