import { Router } from "express";
import { uid } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { MAX_DAILY_SEND_LIMIT, getSettings } from "../lib/settings.js";
import { professorSummarySelect } from "../services/core/schemas.js";
import { countSentToday } from "../services/core/settings.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const include = { professor: { select: professorSummarySelect } } as const;
  const [scheduled, sentToday, replied, failed, upcoming, recentSent, settings] = await Promise.all([
    prisma.email.count({ where: { userId, status: "SCHEDULED" } }),
    countSentToday(userId),
    prisma.professor.count({ where: { userId, status: { in: ["REPLIED", "INTERESTED", "DECLINED"] } } }),
    prisma.email.count({ where: { userId, status: "FAILED" } }),
    prisma.email.findMany({ where: { userId, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 10, include }),
    prisma.email.findMany({ where: { userId, status: "SENT" }, orderBy: { sentAt: "desc" }, take: 10, include }),
    getSettings(userId),
  ]);
  res.json({
    counts: { scheduled, sentToday, replied, failed },
    upcoming,
    recentSent,
    dryRun: env.DRY_RUN,
    dailySendLimit: Math.min(settings.dailySendLimit, MAX_DAILY_SEND_LIMIT),
  });
});
