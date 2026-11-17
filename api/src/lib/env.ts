import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  return !["false", "0", "no", "off"].includes(v.trim().toLowerCase());
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_PROD = NODE_ENV === "production";

/** Web origin (no trailing slash). The browser reaches the API through the web's /api rewrite. */
const PUBLIC_URL = (() => {
  const raw = (process.env.PUBLIC_URL ?? "").trim() || "http://localhost:3100";
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error("PUBLIC_URL must be an absolute URL such as https://your-app.vercel.app");
  }
})();

const CRON_SECRET = (process.env.CRON_SECRET ?? "").trim();
const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY ?? "").trim();

if (IS_PROD) {
  // Render's filesystem is ephemeral, so the dev key-file fallback would lose every stored secret.
  if (!ENCRYPTION_KEY) throw new Error("Missing required environment variable in production: ENCRYPTION_KEY");
  if (CRON_SECRET.length < 16) throw new Error("CRON_SECRET must be set (16+ chars) in production");
  if (!process.env.PUBLIC_URL) throw new Error("Missing required environment variable in production: PUBLIC_URL");
}

export const env = {
  NODE_ENV,
  IS_PROD,
  PORT: int("PORT", 4100),
  PUBLIC_URL,
  DATABASE_URL: required("DATABASE_URL"),

  /** Safety switch: true unless explicitly set to "false". When true, emails are logged, never sent. */
  DRY_RUN: bool("DRY_RUN", true),

  /** Shared by Google sign-in and per-user Gmail OAuth. */
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  LOGIN_REDIRECT_URI: `${PUBLIC_URL}/api/auth/google/callback`,
  GMAIL_REDIRECT_URI: `${PUBLIC_URL}/api/gmail/callback`,

  /** Bearer secret for /jobs/*. Empty (dev only) disables the HTTP job endpoints. */
  CRON_SECRET,
  /** Local QA sign-in without Google. Never active in production. */
  DEV_LOGIN_ENABLED: bool("DEV_LOGIN_ENABLED", false) && !IS_PROD,
  /** Gmail App Password (SMTP/IMAP). Off by default: Render free blocks outbound SMTP. */
  APP_PASSWORD_ENABLED: bool("APP_PASSWORD_ENABLED", false),
  /** Secure flag on cookies. */
  COOKIE_SECURE: bool("COOKIE_SECURE", IS_PROD),

  /** Run cron jobs inside the API process. */
  SCHEDULER_ENABLED: bool("SCHEDULER_ENABLED", true),
  /** Random minimum gap between two sends of the same user (ms). Defaults 30–120 s. */
  SEND_DELAY_MIN_MS: int("SEND_DELAY_MIN_MS", 30_000),
  SEND_DELAY_MAX_MS: int("SEND_DELAY_MAX_MS", 120_000),
} as const;
