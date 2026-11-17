import { Router } from "express";
import { requireUser } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { rateLimit } from "../middleware/security.js";
import { authRouter } from "./auth.js";
import { healthRouter } from "./health.js";
import { professorsRouter } from "./professors.js";
import { templatesRouter } from "./templates.js";
import { importRouter } from "./import.js";
import { emailsRouter } from "./emails.js";
import { settingsRouter } from "./settings.js";
import { dashboardRouter } from "./dashboard.js";
import { appPasswordHandlers, gmailRouter } from "./gmail.js";
import { jobsRouter } from "./jobs.js";
import { devRouter } from "./dev.js";

export const apiRouter = Router();

// Whole /auth prefix; signup / login / forgot / resend / reset add a stricter limiter (routes/auth.ts).
const authLimiter = rateLimit({ capacity: 30, refillPerMinute: 15 });
const appPasswordLimiter = rateLimit({ capacity: 5, refillPerMinute: 2 });

// ---- public ----
apiRouter.use("/health", healthRouter);
// /auth/me runs on every page load and logout must always work: keep them out of the auth limiter.
apiRouter.use(
  "/auth",
  (req, res, next) => (req.path === "/me" || req.path === "/logout" ? next() : authLimiter(req, res, next)),
  authRouter,
);
apiRouter.use("/jobs", jobsRouter); // CRON_SECRET bearer

// ---- signed-in with a verified email (401 / 403 EMAIL_NOT_VERIFIED otherwise) ----
apiRouter.use(requireUser);
apiRouter.use("/professors", professorsRouter);
apiRouter.use("/templates", templatesRouter);
apiRouter.use("/import", importRouter);
apiRouter.use("/emails", emailsRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.post("/gmail/app-password", appPasswordLimiter, ...appPasswordHandlers);
apiRouter.use("/gmail", gmailRouter);
// Dev-only helpers (e.g. simulate a reply) exist only in DRY_RUN.
if (env.DRY_RUN) apiRouter.use("/dev", devRouter);
