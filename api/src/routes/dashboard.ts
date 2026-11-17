import { Router } from "express";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { getSettings } from "../lib/settings.js";
import { professorSummarySelect } from "../services/core/schemas.js";
import { countSentToday } from "../services/core/settings.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req, res) => {
  const include = { professor: { select: professorSummarySelect } } as const;
  const [scheduled, sentToday, replied, failed, upcoming, recentSent, settings] = await Promise.all([
    prisma.email.count({ where: { status: "SCHEDULED" } }),
    countSentToday(),
    prisma.professor.count({ where: { status: { in: ["REPLIED", "INTERESTED", "DECLINED"] } } }),
    prisma.email.count({ where: { status: "FAILED" } }),
    prisma.email.findMany({ where: { status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 10, include }),
    prisma.email.findMany({ where: { status: "SENT" }, orderBy: { sentAt: "desc" }, take: 10, include }),
    getSettings(),
  ]);
  res.json({
    counts: { scheduled, sentToday, replied, failed },
    upcoming,
    recentSent,
    dryRun: env.DRY_RUN,
    dailySendLimit: settings.dailySendLimit,
  });
});
