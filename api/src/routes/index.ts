import { Router } from "express";
import { env } from "../lib/env.js";
import { healthRouter } from "./health.js";
import { professorsRouter } from "./professors.js";
import { templatesRouter } from "./templates.js";
import { importRouter } from "./import.js";
import { emailsRouter } from "./emails.js";
import { settingsRouter } from "./settings.js";
import { dashboardRouter } from "./dashboard.js";
import { gmailRouter } from "./gmail.js";
import { jobsRouter } from "./jobs.js";
import { devRouter } from "./dev.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/professors", professorsRouter);
apiRouter.use("/templates", templatesRouter);
apiRouter.use("/import", importRouter);
apiRouter.use("/emails", emailsRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/gmail", gmailRouter);
apiRouter.use("/jobs", jobsRouter);
// Dev-only helpers (e.g. simulate a reply) exist only in DRY_RUN.
if (env.DRY_RUN) apiRouter.use("/dev", devRouter);
