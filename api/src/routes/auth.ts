/**
 * Email + password accounts (contract v3). All routes are public and rate limited.
 * No account enumeration: signup / resend / forgot answer the same way whether or not the address
 * exists, emails are sent in the background (so timing does not depend on it), and login runs a
 * dummy scrypt for unknown addresses. Never log passwords, tokens or request bodies.
 */
import { randomBytes } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AUTH_USER_SELECT, blockedError, hashToken, createSession, destroySession, publicUser, revokeAllSessions } from "../lib/auth.js";
import { consumeAuthToken, issueAuthToken, RESET_TTL_MS, VERIFY_TTL_MS, webLink } from "../lib/authTokens.js";
import { env } from "../lib/env.js";
import { HttpError, validateBody } from "../lib/http.js";
import { dummyVerify, hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { AttemptCounter, rateLimit, clientIp } from "../middleware/security.js";
import {
  sendAlreadyRegisteredEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/mail/system.js";

export const authRouter = Router();

/** Stricter per-IP limit for signup / login / forgot / resend (burst 10, then 5 per minute). */
const strictLimiter = rateLimit({ capacity: 10, refillPerMinute: 5 });
/**
 * Login failures: 10 per (account, IP) per 15 min, plus 50 per account from all IPs, so one attacker
 * can't lock a user out from their own network while distributed guessing is still capped.
 */
const loginFailures = new AttemptCounter(10, 15 * 60 * 1000);
const loginFailuresPerAccount = new AttemptCounter(50, 15 * 60 * 1000);
const failureKey = (email: string, ip: string | undefined) => `${email}|${ip ?? "?"}`;
/** System mail per recipient address: at most 5 per hour (stops mail-bombing through resend/forgot). */
const mailPerAddress = new AttemptCounter(5, 60 * 60 * 1000);

const emailField = z.string().trim().toLowerCase().max(320).pipe(z.email("Invalid email"));
const passwordField = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`);
const tokenField = z.string().min(1).max(200);

/** Fire-and-forget system mail, throttled per address. Failures are logged by the mailer. */
function sendInBackground(to: string, send: () => Promise<boolean>): void {
  if (!mailPerAddress.tryHit(to)) {
    console.warn("[auth] system mail throttled for one address");
    return;
  }
  void send().catch(() => console.error("[auth] system mail failed"));
}

async function startVerification(user: { id: string; email: string; name: string | null }): Promise<void> {
  if (!mailPerAddress.tryHit(user.email)) {
    console.warn("[auth] verification mail throttled for one address");
    return;
  }
  const token = await issueAuthToken(user.id, "VERIFY_EMAIL", VERIFY_TTL_MS);
  const url = webLink(env.PUBLIC_URL, "/verify-email", token);
  void sendVerificationEmail(user.email, user.name, url).catch(() => console.error("[auth] system mail failed"));
}

// ---------------------------------------------------------------------------------------------
// signup

// The password is NOT chosen at signup. It is set on the verification page, so only the person who controls
// the mailbox can ever set it (prevents pre-verification account takeover).
const nameField = z.string().trim().min(1, "Name is required").max(100);

// Name and password are both chosen on the verification page (by the mailbox owner).
const signupSchema = z.object({
  name: z.unknown().optional(), // accepted and ignored (older clients)
  email: emailField,
});

authRouter.post("/signup", strictLimiter, validateBody(signupSchema), async (req, res) => {
  const body = req.body as z.infer<typeof signupSchema>;
  const existing = await prisma.user.findUnique({ where: { email: body.email } });

  if (!existing) {
    try {
      const user = await prisma.user.create({
        data: { email: body.email, name: null, passwordHash: null },
        select: { id: true, email: true, name: true },
      });
      await startVerification(user);
    } catch (err) {
      // Concurrent signup with the same address: answer the same way.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  } else if (existing.emailVerifiedAt) {
    const login = new URL("/login", env.PUBLIC_URL).toString();
    const forgot = new URL("/forgot-password", env.PUBLIC_URL).toString();
    sendInBackground(existing.email, () => sendAlreadyRegisteredEmail(existing.email, existing.name, login, forgot));
  } else {
    // Unverified account: nothing about it changes; the mailbox owner just gets a fresh link.
    await startVerification({ id: existing.id, email: existing.email, name: existing.name });
  }
  res.status(201).json({ ok: true });
});

// ---------------------------------------------------------------------------------------------
// verify email + set password (signs in)

const verifySchema = z.object({ token: tokenField, name: nameField, password: passwordField });

authRouter.post("/verify-email", validateBody(verifySchema), async (req, res) => {
  const { token, name, password } = req.body as z.infer<typeof verifySchema>;
  // Check the token before the (deliberately slow) password hash, so junk requests are cheap.
  const userId = await consumeAuthToken(token, "VERIFY_EMAIL");
  if (!userId) throw new HttpError(400, "This link is invalid or has expired. Request a new one.");
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: AUTH_USER_SELECT });
  if (!user) throw new HttpError(400, "This link is invalid or has expired. Request a new one.");
  // The link proves control of the mailbox: this is the only place (besides reset) a password is set.
  const verified = await prisma.user.update({
    where: { id: userId },
    data: { name, passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    select: AUTH_USER_SELECT,
  });
  await prisma.authToken.deleteMany({ where: { userId, type: "VERIFY_EMAIL" } });
  await revokeAllSessions(userId);
  await destroySession(req, res);
  if (verified.blockedAt) throw blockedError();
  await createSession(req, res, userId);
  res.json({ ok: true, user: publicUser(verified) });
});

/** Lets the verify page tell a dead link apart before the user types a password. Does not consume. */
authRouter.get("/verify-email/check", async (req, res) => {
  const raw = typeof req.query.token === "string" ? req.query.token : "";
  if (raw.length < 20 || raw.length > 200) return void res.json({ valid: false });
  const row = await prisma.authToken.findUnique({ where: { id: hashToken(raw) }, select: { type: true, usedAt: true, expiresAt: true } });
  res.json({ valid: !!row && row.type === "VERIFY_EMAIL" && !row.usedAt && row.expiresAt > new Date() });
});

const emailOnlySchema = z.object({ email: emailField });

authRouter.post("/resend-verification", strictLimiter, validateBody(emailOnlySchema), async (req, res) => {
  const { email } = req.body as z.infer<typeof emailOnlySchema>;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, emailVerifiedAt: true } });
  if (user && !user.emailVerifiedAt) await startVerification(user);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------------------------
// login

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required").max(PASSWORD_MAX),
});

const INVALID_LOGIN = "Invalid email or password";

authRouter.post("/login", strictLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  if (loginFailures.isBlocked(failureKey(email, clientIp(req))) || loginFailuresPerAccount.isBlocked(email)) {
    throw new HttpError(429, "Too many failed sign-in attempts. Try again in 15 minutes or reset your password.");
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { ...AUTH_USER_SELECT, passwordHash: true } });
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : await dummyVerify(password);
  if (!user || !ok) {
    loginFailures.hit(failureKey(email, clientIp(req)));
    loginFailuresPerAccount.hit(email);
    throw new HttpError(401, INVALID_LOGIN);
  }
  if (!user.emailVerifiedAt) {
    throw new HttpError(403, "Please verify your email address first. Check your inbox for the link.", undefined, "EMAIL_NOT_VERIFIED");
  }
  // Only revealed after a correct password, so it doesn't leak which addresses are blocked.
  if (user.blockedAt) throw blockedError();
  loginFailures.reset(failureKey(email, clientIp(req)));
  loginFailuresPerAccount.reset(email);
  await destroySession(req, res);
  await createSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

// ---------------------------------------------------------------------------------------------
// password reset

authRouter.post("/forgot-password", strictLimiter, validateBody(emailOnlySchema), async (req, res) => {
  const { email } = req.body as z.infer<typeof emailOnlySchema>;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (user && mailPerAddress.tryHit(user.email)) {
    const token = await issueAuthToken(user.id, "RESET_PASSWORD", RESET_TTL_MS);
    const url = webLink(env.PUBLIC_URL, "/reset-password", token);
    void sendPasswordResetEmail(user.email, user.name, url).catch(() => console.error("[auth] system mail failed"));
  }
  res.json({ ok: true });
});

const resetSchema = z.object({ token: tokenField, password: passwordField });

authRouter.post("/reset-password", strictLimiter, validateBody(resetSchema), async (req, res) => {
  const { token, password } = req.body as z.infer<typeof resetSchema>;
  const userId = await consumeAuthToken(token, "RESET_PASSWORD");
  if (!userId) throw new HttpError(400, "This link is invalid or has expired. Request a new one.");
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  if (!existing) throw new HttpError(400, "This link is invalid or has expired. Request a new one.");
  // The link proves control of the mailbox, so it also verifies the address.
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, ...(existing.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }) },
    select: AUTH_USER_SELECT,
  });
  await prisma.authToken.deleteMany({ where: { userId } });
  await revokeAllSessions(userId);
  loginFailuresPerAccount.reset(user.email);
  if (user.blockedAt) throw blockedError();
  await createSession(req, res, userId);
  res.json({ ok: true, user: publicUser(user) });
});

// ---------------------------------------------------------------------------------------------
// session

authRouter.get("/me", (req, res) => {
  if (!req.user) throw new HttpError(401, "Not signed in");
  if (req.user.blockedAt) throw blockedError();
  res.json({ user: publicUser(req.user) });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  res.status(204).end();
});

// Local QA sign-in without a password. Only when DEV_LOGIN_ENABLED=true AND NODE_ENV !== "production".
const devLoginSchema = z.object({
  email: emailField,
  name: z.string().trim().max(200).optional(),
});

const devLoginGuard: RequestHandler = (_req, _res, next) => {
  if (!env.DEV_LOGIN_ENABLED || env.IS_PROD) return next(new HttpError(404, "Not found"));
  next();
};

authRouter.post("/dev-login", devLoginGuard, validateBody(devLoginSchema), async (req, res) => {
  const body = req.body as z.infer<typeof devLoginSchema>;
  const existing = await prisma.user.findUnique({ where: { email: body.email }, select: AUTH_USER_SELECT });
  const user = existing
    ? existing.emailVerifiedAt
      ? existing
      : await prisma.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() }, select: AUTH_USER_SELECT })
    : await prisma.user.create({
        data: {
          email: body.email,
          name: body.name || null,
          // Random, never revealed: dev users sign in via dev-login (or set a password with forgot-password).
          passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
          emailVerifiedAt: new Date(),
        },
        select: AUTH_USER_SELECT,
      });
  if (user.blockedAt) throw blockedError();
  await destroySession(req, res);
  await createSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});
