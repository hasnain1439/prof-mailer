/**
 * Reminder notifications: every due, not-done, not-yet-notified reminder is emailed once to its owner
 * through system mail (the app's own SMTP, not the user's Gmail; not gated by DRY_RUN because it only
 * ever goes to the user themself). A reminder is claimed (notifiedAt set) before sending, so two
 * overlapping ticks never email it twice; a failed send is released for the next tick.
 */
import { prisma } from "../lib/prisma.js";
import { sendReminderEmail } from "../services/mail/system.js";
import { safeErrorMessage } from "./util.js";

const BATCH = 50;

export interface RemindersResult {
  due: number;
  notified: number;
  failed: number;
}

export async function runDueReminders(now: Date = new Date()): Promise<RemindersResult> {
  const due = await prisma.reminder.findMany({
    where: { dueAt: { lte: now }, notifiedAt: null, doneAt: null, user: { blockedAt: null } },
    include: {
      user: { select: { email: true } },
      contact: { select: { name: true, university: true, kind: true } },
    },
    orderBy: { dueAt: "asc" },
    take: BATCH,
  });
  const result: RemindersResult = { due: due.length, notified: 0, failed: 0 };
  for (const r of due) {
    const claimed = await prisma.reminder.updateMany({ where: { id: r.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (claimed.count === 0) continue;
    try {
      const contact = r.contact ? `${r.contact.name} (${r.contact.university})` : null;
      const ok = await sendReminderEmail(r.user.email, { title: r.title, note: r.note, dueAt: r.dueAt, contact });
      if (ok) {
        result.notified++;
        continue;
      }
    } catch (err) {
      console.error(`[reminders] send failed: ${safeErrorMessage(err)}`);
    }
    result.failed++;
    await prisma.reminder.update({ where: { id: r.id }, data: { notifiedAt: null } });
  }
  return result;
}
