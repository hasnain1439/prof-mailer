/**
 * Sign in with Google (OpenID Connect, authorization-code flow). Enabled only when GOOGLE_CLIENT_ID and
 * GOOGLE_CLIENT_SECRET are set. Signs in an existing account with the same (Google-verified) email,
 * or creates a verified account. It only asks for openid/email/profile: sending still uses the
 * user's Gmail App Password.
 *
 * Google redirect URI to register: {PUBLIC_URL}/api/auth/google/callback (the web proxies /api).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { createSession, destroySession } from "../lib/auth.js";
import { clearCookie, getCookie, setCookie } from "../lib/cookies.js";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

export const googleAuthRouter = Router();

const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
const CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
export const googleEnabled = Boolean(CLIENT_ID && CLIENT_SECRET);

const STATE_COOKIE = "pm_google_state";
const STATE_PATH = "/api/auth/google";
const STATE_TTL_MS = 10 * 60 * 1000;

const redirectUri = () => `${env.PUBLIC_URL}/api/auth/google/callback`;

/** Back to the sign-in page with a short error code the page explains. */
function fail(res: Response, code: string): void {
  res.redirect(303, `${env.PUBLIC_URL}/login?google=${encodeURIComponent(code)}`);
}

googleAuthRouter.get("/status", (_req, res) => {
  res.json({ enabled: googleEnabled });
});

googleAuthRouter.get("/start", (_req, res) => {
  if (!googleEnabled) return fail(res, "disabled");
  const state = randomBytes(24).toString("base64url");
  setCookie(res, STATE_COOKIE, state, STATE_TTL_MS, STATE_PATH);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  res.redirect(302, url.toString());
});

interface IdClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  exp?: number;
}

/** The ID token comes straight from Google's token endpoint over TLS, so its claims are trusted (OIDC 3.1.3.7). */
function claimsOf(idToken: string): IdClaims | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as IdClaims;
  } catch {
    return null;
  }
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

googleAuthRouter.get("/callback", async (req: Request, res: Response) => {
  if (!googleEnabled) return fail(res, "disabled");
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const expected = getCookie(req, STATE_COOKIE) ?? "";
  clearCookie(res, STATE_COOKIE, STATE_PATH);
  if (req.query.error) return fail(res, "cancelled");
  if (!code || !state || !expected || !sameString(state, expected)) return fail(res, "state");

  let claims: IdClaims | null = null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await r.json().catch(() => ({}))) as { id_token?: string };
    if (!r.ok || !body.id_token) {
      console.error(`[google-auth] token exchange failed: ${r.status}`);
      return fail(res, "exchange");
    }
    claims = claimsOf(body.id_token);
  } catch (err) {
    console.error(`[google-auth] token exchange error: ${(err as Error).name}`);
    return fail(res, "exchange");
  }

  const issOk = claims?.iss === "https://accounts.google.com" || claims?.iss === "accounts.google.com";
  const verified = claims?.email_verified === true || claims?.email_verified === "true";
  if (!claims || !issOk || claims.aud !== CLIENT_ID || !claims.sub || !claims.email || !verified) return fail(res, "token");
  if (claims.exp && claims.exp * 1000 < Date.now()) return fail(res, "token");

  const email = claims.email.trim().toLowerCase();
  const name = claims.name?.trim().slice(0, 120) || null;
  let user =
    (await prisma.user.findUnique({ where: { googleId: claims.sub }, select: { id: true, blockedAt: true, emailVerifiedAt: true, name: true } })) ??
    (await prisma.user.findUnique({ where: { email }, select: { id: true, blockedAt: true, emailVerifiedAt: true, name: true } }));

  if (user?.blockedAt) return fail(res, "blocked");
  if (user) {
    // Google has verified this address, so it also completes a pending email verification.
    await prisma.user.update({
      where: { id: user.id },
      data: { googleId: claims.sub, ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }), ...(user.name ? {} : { name }) },
    });
  } else {
    user = await prisma.user.create({
      data: { email, name, googleId: claims.sub, emailVerifiedAt: new Date() },
      select: { id: true, blockedAt: true, emailVerifiedAt: true, name: true },
    });
  }

  await destroySession(req, res);
  await createSession(req, res, user.id);
  res.redirect(303, `${env.PUBLIC_URL}/`);
});
