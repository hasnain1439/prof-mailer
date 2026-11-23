/** Registers node-cron jobs (called from src/index.ts when SCHEDULER_ENABLED) and the /jobs/tick runner. */
import cron from "node-cron";
import { pruneExpiredSessions } from "../lib/auth.js";
import { maybeRunCheckReplies, type CheckRepliesResult } from "./checkReplies.js";
import { resetStaleSending, runSendDue, type SendDueResult } from "./sendDue.js";
import { runDueReminders, type RemindersResult } from "./reminders.js";
import { safeErrorMessage } from "./util.js";

export { runSendDue, resetStaleSending } from "./sendDue.js";
export { runCheckReplies, maybeRunCheckReplies } from "./checkReplies.js";
export { runDueReminders } from "./reminders.js";

const HOUR_MS = 60 * 60 * 1000;

let started = false;

function logSendDue(r: SendDueResult) {
  if (r.processed > 0 || r.failed > 0) {
    console.log(
      `[send-due] processed=${r.processed} sent=${r.sent} failed=${r.failed} ` +
        `skippedDueToLimit=${r.skippedDueToLimit} remainingToday=${r.remainingToday}`,
    );
  }
}

function logCheckReplies(r: CheckRepliesResult | null) {
  if (r && (r.repliesFound > 0 || r.followUpsCreated > 0 || r.followUpsCancelled > 0)) {
    console.log(
      `[check-replies] threadsChecked=${r.threadsChecked} repliesFound=${r.repliesFound} ` +
        `followUpsCreated=${r.followUpsCreated} followUpsCancelled=${r.followUpsCancelled}`,
    );
  }
}

function logReminders(r: RemindersResult) {
  if (r.due > 0) console.log(`[reminders] due=${r.due} notified=${r.notified} failed=${r.failed}`);
}

/** External cron tick: send-due, due reminders, plus check-replies when the last check is >= 60 min old. */
export async function runTick(): Promise<{
  sendDue: SendDueResult;
  reminders: RemindersResult;
  checkReplies: CheckRepliesResult | null;
}> {
  const sendDue = await runSendDue();
  logSendDue(sendDue);
  const reminders = await runDueReminders();
  logReminders(reminders);
  const checkReplies = await maybeRunCheckReplies(HOUR_MS);
  logCheckReplies(checkReplies);
  return { sendDue, reminders, checkReplies };
}

export function startScheduler(): void {
  if (started) return;
  started = true;

  resetStaleSending().catch((err: unknown) =>
    console.error(`[scheduler] stale SENDING reset failed: ${safeErrorMessage(err)}`),
  );

  cron.schedule(
    "* * * * *",
    async () => {
      try {
        logSendDue(await runSendDue());
      } catch (err) {
        console.error(`[send-due] run failed: ${safeErrorMessage(err)}`);
      }
    },
    { name: "send-due", noOverlap: true },
  );

  cron.schedule(
    "* * * * *",
    async () => {
      try {
        logReminders(await runDueReminders());
      } catch (err) {
        console.error(`[reminders] run failed: ${safeErrorMessage(err)}`);
      }
    },
    { name: "reminders", noOverlap: true },
  );

  // Polled every 10 min but gated on the persisted lastReplyCheckAt (same 60-min gate as /jobs/tick),
  // so a manual or tick run delays the next check by at most ~10 min past the hour, not a full extra hour.
  cron.schedule(
    "*/10 * * * *",
    async () => {
      try {
        // 30 s slack: lastReplyCheckAt is written a moment after the cron fires, so an exact 60-min gate
        // would just miss the next poll and slip the cadence by 10 min every hour.
        logCheckReplies(await maybeRunCheckReplies(HOUR_MS - 30_000));
      } catch (err) {
        console.error(`[check-replies] run failed: ${safeErrorMessage(err)}`);
      }
    },
    { name: "check-replies", noOverlap: true },
  );

  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        await pruneExpiredSessions();
      } catch (err) {
        console.error(`[scheduler] session prune failed: ${safeErrorMessage(err)}`);
      }
    },
    { name: "session-prune", noOverlap: true },
  );

  console.log("[scheduler] started: send-due and reminders every minute, check-replies when >= 60 min since the last check (polled every 10 min)");
}
