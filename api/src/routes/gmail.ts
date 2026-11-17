import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { randomState, safeEqual, uid } from "../lib/auth.js";
import { clearCookie, readStateCookie, setStateCookie } from "../lib/cookies.js";
import { env } from "../lib/env.js";
import { HttpError, validateBody } from "../lib/http.js";
import { safeErrorMessage } from "../jobs/util.js";
import { connectWithAppPassword } from "../services/gmail/appPassword.js";
import { normalizeAppPassword } from "../services/gmail/appPasswordFormat.js";
import { sendTestEmail } from "../services/gmail/mailer.js";
import {
  createGmailAuthUrl,
  disconnectGmail,
  getGmailAccount,
  handleGmailCallback,
  isGoogleConfigured,
} from "../services/gmail/oauth.js";

/** Routes behind requireUser. The OAuth callback is mounted separately (see gmailCallback). */
export const gmailRouter = Router();

const GMAIL_STATE_COOKIE = "pm_gmail_state";
const GMAIL_STATE_PATH = "/api/gmail";

function webRedirect(params: Record<string, string>): string {
  const url = new URL("/gmail", env.PUBLIC_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

gmailRouter.get("/status", async (req, res) => {
  const account = await getGmailAccount(uid(req));
  const oauthConfigured = isGoogleConfigured();
  const usable = account ? account.authType === "OAUTH" || env.APP_PASSWORD_ENABLED : false;
  res.json({
    /** @deprecated same as oauthConfigured */
    configured: oauthConfigured,
    oauthConfigured,
    connected: usable,
    email: usable ? account!.email : null,
    authType: usable ? account!.authType : null,
    dryRun: env.DRY_RUN,
    // Test sends go to the signed-in user's own address, which always exists.
    testRecipientSet: true,
    appPasswordEnabled: env.APP_PASSWORD_ENABLED,
  });
});

gmailRouter.get("/connect", (req, res) => {
  if (!isGoogleConfigured()) throw new HttpError(503, "Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET)");
  const state = randomState();
  setStateCookie(res, GMAIL_STATE_COOKIE, { s: state, u: uid(req) }, GMAIL_STATE_PATH);
  res.redirect(302, createGmailAuthUrl(state, req.user!.email));
});

/**
 * GET /gmail/callback. Mounted before requireUser so a missing session can redirect to the login
 * page instead of returning JSON. The state must match the cookie, and the cookie's user must be
 * the signed-in user.
 */
export const gmailCallback: RequestHandler = async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const saved = readStateCookie(req, GMAIL_STATE_COOKIE);
  clearCookie(res, GMAIL_STATE_COOKIE, GMAIL_STATE_PATH);
  if (!req.user) {
    const url = new URL("/login", env.PUBLIC_URL);
    url.searchParams.set("next", "/gmail");
    return res.redirect(302, url.toString());
  }
  if (!isGoogleConfigured()) return res.redirect(302, webRedirect({ error: "not_configured" }));
  if (typeof q.error === "string") return res.redirect(302, webRedirect({ error: "access_denied" }));
  if (!saved?.s || !saved.u || typeof q.state !== "string" || !safeEqual(saved.s, q.state) || saved.u !== req.user.id) {
    return res.redirect(302, webRedirect({ error: "invalid_state" }));
  }
  if (typeof q.code !== "string" || !q.code) return res.redirect(302, webRedirect({ error: "missing_code" }));
  try {
    await handleGmailCallback(req.user.id, q.code);
    return res.redirect(302, webRedirect({ connected: "1" }));
  } catch (err) {
    console.error(`[gmail] OAuth callback failed: ${safeErrorMessage(err, 200)}`);
    return res.redirect(302, webRedirect({ error: "oauth_failed" }));
  }
};

// Connect with Gmail address + Google App Password (SMTP + IMAP). Disabled unless APP_PASSWORD_ENABLED
// (Render free blocks outbound SMTP). Never echo or log the password.
const appPasswordSchema = z.object({
  email: z.string().trim().max(320),
  appPassword: z.string().max(200),
});

export const appPasswordHandlers: RequestHandler[] = [
  (_req, _res, next) => {
    if (!env.APP_PASSWORD_ENABLED) return next(new HttpError(403, "App Password connections are disabled on this server"));
    next();
  },
  validateBody(appPasswordSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof appPasswordSchema>;
    const password = normalizeAppPassword(body.appPassword);
    if (!password) {
      throw new HttpError(
        400,
        "An App Password is 16 letters (Google shows it as 4 groups of 4). Create one at https://myaccount.google.com/apppasswords - your normal Gmail password will not work.",
      );
    }
    const { email } = await connectWithAppPassword(uid(req), body.email, password);
    res.json({ ok: true, email });
  },
];

gmailRouter.post("/disconnect", async (req, res) => {
  await disconnectGmail(uid(req));
  res.status(204).end();
});

const testSendSchema = z
  .object({ subject: z.string().max(500).optional(), body: z.string().max(20_000).optional() })
  .default({});

gmailRouter.post(
  "/test-send",
  (req, _res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  },
  validateBody(testSendSchema),
  async (req, res) => {
    const r = await sendTestEmail(uid(req), req.user!.email, req.body as z.infer<typeof testSendSchema>);
    if (r.dryRun) return res.json({ ok: true, dryRun: true, to: r.to });
    return res.json({ ok: true, to: r.to, gmailThreadId: r.gmailThreadId, messageIdHeader: r.messageIdHeader });
  },
);
