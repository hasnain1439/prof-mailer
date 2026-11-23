/**
 * The sender profile (Settings → Your profile): the user's own name, title, links and summary,
 * filled into templates as {{myName}}, {{myTitle}}, ... so a template has no hard-coded personal data
 * and works for every user. {{myEmail}} falls back to the connected Gmail, then the login email.
 */
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getSettings } from "../../lib/settings.js";
import type { SenderProfile } from "../../lib/template.js";
import { optStr } from "./schemas.js";

const optUrl = optStr.refine((v) => v == null || /^https?:\/\/\S+$/i.test(v), "Must be an http(s) URL");

export const senderProfileInput = z.object({
  myName: optStr.refine((v) => v == null || v.length <= 120, "Too long"),
  myTitle: optStr.refine((v) => v == null || v.length <= 120, "Too long"),
  myEmail: optStr.refine((v) => v == null || /^\S+@\S+\.\S+$/.test(v), "Invalid email"),
  myPhone: optStr.refine((v) => v == null || v.length <= 40, "Too long"),
  myLinkedIn: optUrl,
  myPortfolio: optUrl,
  myEducation: optStr.refine((v) => v == null || v.length <= 200, "Too long"),
  mySummary: optStr.refine((v) => v == null || v.length <= 2000, "Too long (max 2000 characters)"),
});

/** Stored profile fields only (what the settings form edits). */
export async function getStoredSenderProfile(userId: string): Promise<Required<SenderProfile>> {
  const s = await getSettings(userId);
  return {
    myName: s.myName,
    myTitle: s.myTitle,
    myEmail: s.myEmail,
    myPhone: s.myPhone,
    myLinkedIn: s.myLinkedIn,
    myPortfolio: s.myPortfolio,
    myEducation: s.myEducation,
    mySummary: s.mySummary,
  };
}

/** Profile used for rendering: empty name/email fall back to the account's name and sending address. */
export async function loadSenderProfile(userId: string): Promise<SenderProfile> {
  const [stored, user] = await Promise.all([
    getStoredSenderProfile(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, gmailAccount: { select: { email: true } } } }),
  ]);
  return {
    ...stored,
    myName: stored.myName ?? user?.name ?? null,
    myEmail: stored.myEmail ?? user?.gmailAccount?.email ?? user?.email ?? null,
  };
}
