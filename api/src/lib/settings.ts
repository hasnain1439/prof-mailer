import { prisma } from "./prisma.js";

/** Returns the single Settings row, creating it with defaults if missing. */
export function getSettings() {
  return prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
