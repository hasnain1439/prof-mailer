import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { uid } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { HttpError, validateBody } from "../lib/http.js";
import { disconnectGmail, getGmailAccount } from "../services/gmail/account.js";
import { connectWithAppPassword } from "../services/gmail/appPassword.js";
import { normalizeAppPassword } from "../services/gmail/appPasswordFormat.js";
import { sendTestEmail } from "../services/gmail/mailer.js";

/** Routes behind requireUser. Gmail is connected only with an address + Google App Password. */
export const gmailRouter = Router();

gmailRouter.get("/status", async (req, res) => {
  const account = await getGmailAccount(uid(req));
  const connected = Boolean(account && account.authType === "APP_PASSWORD" && account.appPasswordEnc);
  res.json({
    connected,
    email: connected ? account!.email : null,
    authType: connected ? ("APP_PASSWORD" as const) : null,
    dryRun: env.DRY_RUN,
  });
});

// Connect with Gmail address + Google App Password (verifies SMTP + IMAP). Never echo or log the password.
const appPasswordSchema = z.object({
  email: z.string().trim().max(320),
  appPassword: z.string().max(200),
});

export const appPasswordHandlers: RequestHandler[] = [
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
    // Always the signed-in user's own login address.
    const r = await sendTestEmail(uid(req), req.user!.email, req.body as z.infer<typeof testSendSchema>);
    if (r.dryRun) return res.json({ ok: true, dryRun: true, to: r.to });
    return res.json({ ok: true, to: r.to, gmailThreadId: r.gmailThreadId, messageIdHeader: r.messageIdHeader });
  },
);
