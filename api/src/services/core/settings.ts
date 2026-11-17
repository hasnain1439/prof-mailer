import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { MAX_DAILY_SEND_LIMIT, getSettings } from "../../lib/settings.js";
import { APP_TIMEZONE, startOfKarachiDay } from "../../lib/time.js";

export function countSentToday(userId: string) {
  return prisma.email.count({ where: { userId, status: "SENT", sentAt: { gte: startOfKarachiDay() } } });
}

/** Build the SettingsResponse for one user. */
export async function buildSettingsResponse(userId: string) {
  const [s, sentToday] = await Promise.all([getSettings(userId), countSentToday(userId)]);
  return {
    followUpAfterDays: s.followUpAfterDays,
    maxFollowUps: s.maxFollowUps,
    dailySendLimit: Math.min(s.dailySendLimit, MAX_DAILY_SEND_LIMIT),
    followUpTemplateId: s.followUpTemplateId,
    dryRun: env.DRY_RUN,
    // Test sends always go to the signed-in user's own address.
    testRecipientSet: true,
    timezone: APP_TIMEZONE as "Asia/Karachi",
    sentToday,
  };
}
