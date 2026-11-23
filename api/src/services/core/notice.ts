/**
 * One app-wide notice that every signed-in user sees on the dashboard until they dismiss it.
 * The admin edits it in the admin panel; saving a new version (new updatedAt) shows it again to
 * everyone, including users who dismissed the old one (dismissals are per version, in the browser).
 * Plain text only: the web renders it as text, never as HTML.
 */
import { z } from "zod";
import { getAppState, setAppState } from "../../lib/appState.js";

const KEY = "notice";

export interface Notice {
  enabled: boolean;
  title: string;
  body: string;
  /** ISO time of the last save; also the version the web uses for "dismissed". */
  updatedAt: string;
}

export const noticeInput = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1, "Required").max(120),
  body: z.string().trim().min(1, "Required").max(4000),
});

/** Shown until the admin saves their own notice. */
export const DEFAULT_NOTICE: Notice = {
  enabled: true,
  title: "Before you send: keep your emails out of spam",
  body: [
    "• Emails go from your own Gmail, so your Gmail's reputation matters. Start slow: 5–10 emails a day in the first week, then raise the daily limit in Settings (max 20 is a good start).",
    "• Professors: prefer the plain template. Heavily designed emails can land in Promotions or Spam. Designed templates are fine for companies.",
    "• Keep links to 2–3 (LinkedIn, portfolio) and keep your CV PDF under 1 MB.",
    "• Check email addresses before importing. Bounced emails hurt your sender reputation.",
    "• Make every email personal: fill the \"whyFits\" column for each contact, ideally naming one of their papers or the exact role.",
    "• Avoid ALL CAPS, \"URGENT\" and lots of exclamation marks.",
    "• Test first: add your own second email address as a contact, send to it, and check it arrives in the Inbox.",
  ].join("\n"),
  updatedAt: "2026-11-23T00:00:00.000Z",
};

export async function getNotice(): Promise<Notice> {
  const raw = await getAppState(KEY);
  if (!raw) return DEFAULT_NOTICE;
  try {
    const n = JSON.parse(raw) as Notice;
    if (typeof n.title === "string" && typeof n.body === "string" && typeof n.updatedAt === "string") return { ...n, enabled: !!n.enabled };
  } catch {
    // fall through to the default
  }
  return DEFAULT_NOTICE;
}

export async function saveNotice(input: z.infer<typeof noticeInput>): Promise<Notice> {
  const n: Notice = { ...input, updatedAt: new Date().toISOString() };
  await setAppState(KEY, JSON.stringify(n));
  return n;
}
