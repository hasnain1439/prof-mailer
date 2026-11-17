import { prisma } from "./prisma.js";

/** Server-side cap on dailySendLimit (Gmail reputation / abuse guard). */
export const MAX_DAILY_SEND_LIMIT = 50;

/** Returns the user's Settings row, creating it with defaults if missing. */
export function getSettings(userId: string) {
  return prisma.settings.upsert({ where: { userId }, update: {}, create: { userId } });
}
