/**
 * Sessions: a random 32-byte token lives only in the httpOnly `pm_session` cookie; the DB stores
 * sha256(token) as Session.id, so a DB leak does not yield usable cookies. Never log tokens.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { clearCookie, getCookie, setCookie } from "./cookies.js";
import { env } from "./env.js";
import { HttpError } from "./http.js";
import { prisma } from "./prisma.js";

export const SESSION_COOKIE = "pm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend the session when less than this much lifetime is left (sliding expiry). */
const REFRESH_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  blockedAt: Date | null;
}

/** Admins are listed in env ADMIN_EMAILS (no DB role): derived on every request. */
export function isAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.has(email.trim().toLowerCase());
}

/** Public JSON shape of the signed-in user (GET /auth/me, POST /auth/login). */
export function publicUser(u: AuthUser) {
  return { id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerifiedAt !== null, isAdmin: isAdminEmail(u.email) };
}

export const AUTH_USER_SELECT = { id: true, email: true, name: true, emailVerifiedAt: true, blockedAt: true } as const;

export const ACCOUNT_BLOCKED = "ACCOUNT_BLOCKED";
export function blockedError(): HttpError {
  return new HttpError(403, "This account has been blocked.", undefined, ACCOUNT_BLOCKED);
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createSession(req: Request, res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const ua = req.get("user-agent");
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: ua ? ua.slice(0, 300) : null,
    },
  });
  setCookie(res, SESSION_COOKIE, token, SESSION_TTL_MS);
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  clearCookie(res, SESSION_COOKIE);
}

/** Attaches req.user when the cookie maps to a live session. Never rejects. */
export const attachUser: RequestHandler = async (req, res, next) => {
  try {
    const token = getCookie(req, SESSION_COOKIE);
    if (!token || token.length > 200) return next();
    const id = hashToken(token);
    const session = await prisma.session.findUnique({
      where: { id },
      include: { user: { select: AUTH_USER_SELECT } },
    });
    if (!session) return next();
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      await prisma.session.deleteMany({ where: { id } });
      clearCookie(res, SESSION_COOKIE);
      return next();
    }
    if (session.expiresAt.getTime() - now < REFRESH_WHEN_LEFT_MS) {
      await prisma.session.update({ where: { id }, data: { expiresAt: new Date(now + SESSION_TTL_MS) } });
      setCookie(res, SESSION_COOKIE, token, SESSION_TTL_MS);
    }
    req.user = session.user;
    req.sessionId = id;
    next();
  } catch (err) {
    next(err);
  }
};

/** Revoke every session of a user (password reset, admin block). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Signed in AND email verified AND not blocked. Mounted after the public /auth routes. */
export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, "Not signed in"));
  if (req.user.blockedAt) return next(blockedError());
  if (!req.user.emailVerifiedAt) {
    return next(new HttpError(403, "Please verify your email address first", undefined, "EMAIL_NOT_VERIFIED"));
  }
  next();
};

/** The signed-in user's id (for routes behind requireUser). */
export function uid(req: Request): string {
  if (!req.user) throw new HttpError(401, "Not signed in");
  return req.user.id;
}

/** Remove expired sessions and email-link tokens (called from the scheduler). */
export async function pruneExpiredSessions(): Promise<number> {
  const now = new Date();
  const r = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.authToken.deleteMany({ where: { expiresAt: { lt: now } } });
  return r.count;
}

/** Constant-time string compare (hashes first, so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
