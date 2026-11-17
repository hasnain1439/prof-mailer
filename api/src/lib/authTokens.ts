/**
 * One-time email-link tokens (verify email, reset password). The raw 32-byte token only goes into
 * the emailed link; the DB stores sha256(token) as AuthToken.id. Never log raw tokens (except the
 * dev-only console fallback of the system mailer, which prints the link instead of emailing it).
 */
import { randomBytes } from "node:crypto";
import type { AuthTokenType } from "@prisma/client";
import { hashToken } from "./auth.js";
import { prisma } from "./prisma.js";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Create a new token (older unused tokens of the same type stop working). Returns the raw token. */
export async function issueAuthToken(userId: string, type: AuthTokenType, ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type } }),
    prisma.authToken.create({
      data: { id: hashToken(token), userId, type, expiresAt: new Date(Date.now() + ttlMs) },
    }),
  ]);
  return token;
}

/** Atomically mark a valid token used. Returns its userId, or null when invalid / expired / used. */
export async function consumeAuthToken(raw: unknown, type: AuthTokenType): Promise<string | null> {
  if (typeof raw !== "string" || raw.length < 20 || raw.length > 200) return null;
  const id = hashToken(raw);
  const now = new Date();
  const r = await prisma.authToken.updateMany({
    where: { id, type, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (r.count !== 1) return null;
  const row = await prisma.authToken.findUnique({ where: { id }, select: { userId: true } });
  return row?.userId ?? null;
}

export function webLink(publicUrl: string, path: string, token: string): string {
  const url = new URL(path, publicUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
