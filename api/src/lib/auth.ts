/**
 * Sessions: a random 32-byte token lives only in the httpOnly `pm_session` cookie; the DB stores
 * sha256(token) as Session.id, so a DB leak does not yield usable cookies. Never log tokens.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { clearCookie, getCookie, setCookie } from "./cookies.js";
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
  picture: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

function hashToken(token: string): string {
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
      include: { user: { select: { id: true, email: true, name: true, picture: true } } },
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

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, "Not signed in"));
  next();
};

/** The signed-in user's id (for routes behind requireUser). */
export function uid(req: Request): string {
  if (!req.user) throw new HttpError(401, "Not signed in");
  return req.user.id;
}

/** Remove expired sessions (called from the scheduler / tick). */
export async function pruneExpiredSessions(): Promise<number> {
  const r = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return r.count;
}

/** Constant-time string compare (hashes first, so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Only same-site relative paths ("/x", not "//host" or "/\host"); anything else becomes "/". */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 500) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (/[\u0000-\u001f\\]/.test(raw)) return "/";
  return raw;
}

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}
