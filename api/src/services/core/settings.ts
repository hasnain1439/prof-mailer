import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { getSettings } from "../../lib/settings.js";
import { APP_TIMEZONE, startOfKarachiDay } from "../../lib/time.js";

export function countSentToday() {
  return prisma.email.count({ where: { status: "SENT", sentAt: { gte: startOfKarachiDay() } } });
}

/** Build the SettingsResponse (never exposes TEST_RECIPIENT itself). */
export async function buildSettingsResponse() {
  const [s, sentToday] = await Promise.all([getSettings(), countSentToday()]);
  return {
    followUpAfterDays: s.followUpAfterDays,
    maxFollowUps: s.maxFollowUps,
    dailySendLimit: s.dailySendLimit,
    followUpTemplateId: s.followUpTemplateId,
    dryRun: env.DRY_RUN,
    testRecipientSet: Boolean(env.TEST_RECIPIENT),
    timezone: APP_TIMEZONE as "Asia/Karachi",
    sentToday,
  };
}
