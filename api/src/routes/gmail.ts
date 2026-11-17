import { Router } from "express";
import { z } from "zod";
import { env } from "../lib/env.js";
import { HttpError, validateBody } from "../lib/http.js";
import { sendTestEmail } from "../services/gmail/mailer.js";
import {
  consumeState,
  createAuthUrl,
  disconnectGmail,
  getGmailAccount,
  handleOAuthCallback,
  isGoogleConfigured,
} from "../services/gmail/oauth.js";

export const gmailRouter = Router();

function webRedirect(params: Record<string, string>): string {
  const url = new URL("/gmail", env.WEB_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

gmailRouter.get("/status", async (_req, res) => {
  const account = await getGmailAccount();
  res.json({
    configured: isGoogleConfigured(),
    connected: Boolean(account),
    email: account?.email ?? null,
    dryRun: env.DRY_RUN,
    testRecipientSet: Boolean(env.TEST_RECIPIENT.trim()),
  });
});

gmailRouter.get("/connect", (_req, res) => {
  if (!isGoogleConfigured()) throw new HttpError(503, "Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET)");
  res.redirect(302, createAuthUrl());
});

gmailRouter.get("/callback", async (req, res) => {
  const q = req.query as Record<string, unknown>;
  if (!isGoogleConfigured()) return res.redirect(302, webRedirect({ error: "not_configured" }));
  if (typeof q.error === "string") {
    consumeState(q.state);
    return res.redirect(302, webRedirect({ error: q.error.slice(0, 100) }));
  }
  if (!consumeState(q.state)) return res.redirect(302, webRedirect({ error: "invalid_state" }));
  if (typeof q.code !== "string" || !q.code) return res.redirect(302, webRedirect({ error: "missing_code" }));
  try {
    await handleOAuthCallback(q.code);
    return res.redirect(302, webRedirect({ connected: "1" }));
  } catch (err) {
    // Message only; never the code or tokens.
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[gmail] OAuth callback failed:", msg.replace(/(code|token)=\S+/gi, "$1=[redacted]").slice(0, 200));
    return res.redirect(302, webRedirect({ error: "oauth_failed" }));
  }
});

gmailRouter.post("/disconnect", async (_req, res) => {
  await disconnectGmail();
  res.status(204).end();
});

const testSendSchema = z
  .object({ subject: z.string().max(500).optional(), body: z.string().max(20_000).optional() })
  .default({});

gmailRouter.post("/test-send", (req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
}, validateBody(testSendSchema), async (req, res) => {
  const r = await sendTestEmail(req.body as z.infer<typeof testSendSchema>);
  if (r.dryRun) return res.json({ ok: true, dryRun: true, to: r.to });
  return res.json({ ok: true, to: r.to, gmailThreadId: r.gmailThreadId, messageIdHeader: r.messageIdHeader });
});
