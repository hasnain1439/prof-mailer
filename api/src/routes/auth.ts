import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { createSession, destroySession, randomState, safeEqual, safeNextPath } from "../lib/auth.js";
import { clearCookie, readStateCookie, setStateCookie } from "../lib/cookies.js";
import { env } from "../lib/env.js";
import { HttpError, validateBody } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { createLoginAuthUrl, exchangeLoginCode, isGoogleConfigured } from "../services/gmail/oauth.js";
import { safeErrorMessage } from "../jobs/util.js";

export const authRouter = Router();

const LOGIN_STATE_COOKIE = "pm_login_state";
const LOGIN_STATE_PATH = "/api/auth";

function loginErrorRedirect(code: string): string {
  const url = new URL("/login", env.PUBLIC_URL);
  url.searchParams.set("error", code);
  return url.toString();
}

async function upsertUser(identity: { sub: string; email: string; name: string | null; picture: string | null }) {
  return prisma.user.upsert({
    where: { googleSub: identity.sub },
    update: { email: identity.email, name: identity.name, picture: identity.picture },
    create: { googleSub: identity.sub, email: identity.email, name: identity.name, picture: identity.picture },
    select: { id: true },
  });
}

authRouter.get("/google", (req, res) => {
  if (!isGoogleConfigured()) return res.redirect(302, loginErrorRedirect("not_configured"));
  const state = randomState();
  setStateCookie(res, LOGIN_STATE_COOKIE, { s: state, n: safeNextPath(req.query.next) }, LOGIN_STATE_PATH);
  res.redirect(302, createLoginAuthUrl(state));
});

authRouter.get("/google/callback", async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const saved = readStateCookie(req, LOGIN_STATE_COOKIE);
  clearCookie(res, LOGIN_STATE_COOKIE, LOGIN_STATE_PATH);
  if (!isGoogleConfigured()) return res.redirect(302, loginErrorRedirect("not_configured"));
  if (typeof q.error === "string") return res.redirect(302, loginErrorRedirect("access_denied"));
  if (!saved?.s || typeof q.state !== "string" || !safeEqual(saved.s, q.state)) {
    return res.redirect(302, loginErrorRedirect("invalid_state"));
  }
  if (typeof q.code !== "string" || !q.code) return res.redirect(302, loginErrorRedirect("missing_code"));
  try {
    const identity = await exchangeLoginCode(q.code);
    const user = await upsertUser(identity);
    await createSession(req, res, user.id);
    return res.redirect(302, `${env.PUBLIC_URL}${safeNextPath(saved.n)}`);
  } catch (err) {
    console.error(`[auth] Google sign-in failed: ${safeErrorMessage(err, 200)}`);
    return res.redirect(302, loginErrorRedirect("signin_failed"));
  }
});

authRouter.get("/me", (req, res) => {
  if (!req.user) throw new HttpError(401, "Not signed in");
  const { id, email, name, picture } = req.user;
  res.json({ user: { id, email, name, picture } });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
});

// Local QA sign-in without Google. Only when DEV_LOGIN_ENABLED=true AND NODE_ENV !== "production".
const devLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Invalid email")),
  name: z.string().trim().max(200).optional(),
});

authRouter.post("/dev-login", (req, _res, next) => {
  if (!env.DEV_LOGIN_ENABLED || env.IS_PROD) return next(new HttpError(404, "Not found"));
  next();
}, validateBody(devLoginSchema), async (req, res) => {
  const body = req.body as z.infer<typeof devLoginSchema>;
  // Synthetic, stable "sub" that can never collide with a real Google sub (those are numeric).
  const sub = `dev:${createHash("sha256").update(body.email).digest("hex").slice(0, 32)}`;
  const user = await upsertUser({ sub, email: body.email, name: body.name || null, picture: null });
  await createSession(req, res, user.id);
  const full = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, email: true, name: true, picture: true },
  });
  res.json({ user: full });
});
