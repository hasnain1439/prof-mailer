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

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: int("PORT", 4000),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  WEB_URL: process.env.WEB_URL ?? "http://localhost:3000",
  DATABASE_URL: required("DATABASE_URL"),

  /** Safety switch: true unless explicitly set to "false". When true, emails are logged, never sent. */
  DRY_RUN: bool("DRY_RUN", true),
  /** The only address a manual test send may go to. */
  TEST_RECIPIENT: process.env.TEST_RECIPIENT ?? "",

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/api/gmail/callback",

  /** Run cron jobs inside the API process. */
  SCHEDULER_ENABLED: bool("SCHEDULER_ENABLED", true),
  /** Random pause between consecutive sends (ms). Defaults 30–120 s. */
  SEND_DELAY_MIN_MS: int("SEND_DELAY_MIN_MS", 30_000),
  SEND_DELAY_MAX_MS: int("SEND_DELAY_MAX_MS", 120_000),
} as const;
