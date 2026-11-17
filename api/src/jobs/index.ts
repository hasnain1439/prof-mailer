/** Registers node-cron jobs (called from src/index.ts when SCHEDULER_ENABLED) and the /jobs/tick runner. */
import cron from "node-cron";
import { pruneExpiredSessions } from "../lib/auth.js";
import { maybeRunCheckReplies, type CheckRepliesResult } from "./checkReplies.js";
import { resetStaleSending, runSendDue, type SendDueResult } from "./sendDue.js";
import { safeErrorMessage } from "./util.js";

export { runSendDue, resetStaleSending } from "./sendDue.js";
export { runCheckReplies, maybeRunCheckReplies } from "./checkReplies.js";

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

/** External cron tick: send-due, plus check-replies when the last check is >= 60 min old. */
export async function runTick(): Promise<{ sendDue: SendDueResult; checkReplies: CheckRepliesResult | null }> {
  const sendDue = await runSendDue();
  logSendDue(sendDue);
  const checkReplies = await maybeRunCheckReplies(HOUR_MS);
  logCheckReplies(checkReplies);
  return { sendDue, checkReplies };
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
    "0 * * * *",
    async () => {
      try {
        // Slightly under an hour so a /jobs/tick run a few minutes earlier doesn't push this to the next hour.
        logCheckReplies(await maybeRunCheckReplies(50 * 60 * 1000));
      } catch (err) {
        console.error(`[check-replies] run failed: ${safeErrorMessage(err)}`);
      }
      try {
        await pruneExpiredSessions();
      } catch (err) {
        console.error(`[scheduler] session prune failed: ${safeErrorMessage(err)}`);
      }
    },
    { name: "check-replies", noOverlap: true },
  );

  console.log("[scheduler] started: send-due every minute, check-replies hourly");
}
