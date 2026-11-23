/**
 * Reply analytics over the user's first emails (followUpNo 0, SENT). A thread counts as replied when
 * its first email has repliedAt (the reply checker stamps every SENT email of a replied thread).
 * Aggregated in memory: one row per sent thread is small even for thousands of contacts.
 */
import { Router } from "express";
import { z } from "zod";
import { uid } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { parseQuery } from "../lib/http.js";
import { startOfKarachiDay } from "../lib/time.js";

export const analyticsRouter = Router();

const query = z.object({ kind: z.enum(["PROFESSOR", "COMPANY", ""]).optional() });

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 12;

interface Bucket {
  key: string;
  label: string;
  sent: number;
  replied: number;
  replyRate: number;
}

function rate(replied: number, sent: number): number {
  return sent === 0 ? 0 : Math.round((replied / sent) * 1000) / 10;
}

function tally(map: Map<string, Bucket>, key: string, label: string, replied: boolean) {
  const b = map.get(key) ?? { key, label, sent: 0, replied: 0, replyRate: 0 };
  b.sent++;
  if (replied) b.replied++;
  map.set(key, b);
}

function finish(map: Map<string, Bucket>, limit: number): Bucket[] {
  return [...map.values()]
    .map((b) => ({ ...b, replyRate: rate(b.replied, b.sent) }))
    .sort((a, b) => b.sent - a.sent || b.replied - a.replied || a.label.localeCompare(b.label))
    .slice(0, limit);
}

analyticsRouter.get("/", async (req, res) => {
  const { kind } = parseQuery(query, req.query);
  const userId = uid(req);
  const firsts = await prisma.email.findMany({
    where: { userId, followUpNo: 0, status: "SENT", ...(kind ? { professor: { kind } } : {}) },
    select: {
      sentAt: true,
      repliedAt: true,
      templateId: true,
      template: { select: { name: true } },
      professor: { select: { kind: true, country: true, university: true } },
    },
  });
  // Follow-up emails actually sent, for context next to the first-email numbers.
  const followUpsSent = await prisma.email.count({
    where: { userId, followUpNo: { gt: 0 }, status: "SENT", ...(kind ? { professor: { kind } } : {}) },
  });

  const byTemplate = new Map<string, Bucket>();
  const byCountry = new Map<string, Bucket>();
  const byOrg = new Map<string, Bucket>();
  const byKind = new Map<string, Bucket>();

  // Weekly series (Karachi weeks starting Monday), oldest first.
  const today = startOfKarachiDay();
  const dow = (new Date(today.getTime() + 5 * 3600_000).getUTCDay() + 6) % 7; // 0 = Monday
  const thisWeek = today.getTime() - dow * DAY_MS;
  const firstWeek = thisWeek - (WEEKS - 1) * 7 * DAY_MS;
  const weekly = Array.from({ length: WEEKS }, (_, i) => ({
    weekStart: new Date(firstWeek + i * 7 * DAY_MS).toISOString(),
    sent: 0,
    replied: 0,
  }));

  let replied = 0;
  let replyHoursTotal = 0;
  let replyHoursCount = 0;

  for (const e of firsts) {
    const isReplied = e.repliedAt !== null;
    if (isReplied) replied++;
    if (isReplied && e.sentAt && e.repliedAt) {
      const h = (e.repliedAt.getTime() - e.sentAt.getTime()) / 3600_000;
      if (h >= 0) {
        replyHoursTotal += h;
        replyHoursCount++;
      }
    }
    tally(byTemplate, e.templateId ?? "none", e.template?.name ?? "No template / edited", isReplied);
    const country = e.professor.country?.trim() || "Unknown";
    tally(byCountry, country.toLowerCase(), country, isReplied);
    const org = e.professor.university.trim();
    tally(byOrg, org.toLowerCase(), org, isReplied);
    tally(byKind, e.professor.kind, e.professor.kind === "COMPANY" ? "Companies" : "Professors", isReplied);

    if (e.sentAt) {
      const w = Math.floor((e.sentAt.getTime() - firstWeek) / (7 * DAY_MS));
      if (w >= 0 && w < WEEKS) {
        weekly[w]!.sent++;
        if (isReplied) weekly[w]!.replied++;
      }
    }
  }

  res.json({
    totals: {
      sent: firsts.length,
      replied,
      replyRate: rate(replied, firsts.length),
      followUpsSent,
      avgReplyHours: replyHoursCount ? Math.round((replyHoursTotal / replyHoursCount) * 10) / 10 : null,
    },
    byKind: finish(byKind, 2),
    byTemplate: finish(byTemplate, 20),
    byCountry: finish(byCountry, 15),
    byOrg: finish(byOrg, 15),
    weekly,
  });
});
