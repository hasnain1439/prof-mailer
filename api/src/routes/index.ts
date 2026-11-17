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
import { appPasswordHandlers, gmailCallback, gmailRouter } from "./gmail.js";
import { jobsRouter } from "./jobs.js";
import { devRouter } from "./dev.js";

export const apiRouter = Router();

const authLimiter = rateLimit({ capacity: 20, refillPerMinute: 10 });
const appPasswordLimiter = rateLimit({ capacity: 5, refillPerMinute: 2 });

// ---- public ----
apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authLimiter, authRouter);
apiRouter.use("/jobs", jobsRouter); // CRON_SECRET bearer
apiRouter.get("/gmail/callback", authLimiter, gmailCallback); // checks the session itself (redirects)

// ---- signed-in only ----
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
