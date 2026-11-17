/** Registers node-cron jobs. Called from src/index.ts when SCHEDULER_ENABLED. */
import cron from "node-cron";
import { runCheckReplies } from "./checkReplies.js";
import { resetStaleSending, runSendDue } from "./sendDue.js";
import { safeErrorMessage } from "./util.js";

export { runSendDue, resetStaleSending } from "./sendDue.js";
export { runCheckReplies } from "./checkReplies.js";

let started = false;

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
        const r = await runSendDue();
        if (r.processed > 0 || r.failed > 0) {
          console.log(
            `[send-due] processed=${r.processed} sent=${r.sent} failed=${r.failed} ` +
              `skippedDueToLimit=${r.skippedDueToLimit} remainingToday=${r.remainingToday}`,
          );
        }
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
        const r = await runCheckReplies();
        if (r.repliesFound > 0 || r.followUpsCreated > 0 || r.followUpsCancelled > 0) {
          console.log(
            `[check-replies] threadsChecked=${r.threadsChecked} repliesFound=${r.repliesFound} ` +
              `followUpsCreated=${r.followUpsCreated} followUpsCancelled=${r.followUpsCancelled}`,
          );
        }
      } catch (err) {
        console.error(`[check-replies] run failed: ${safeErrorMessage(err)}`);
      }
    },
    { name: "check-replies", noOverlap: true },
  );

  console.log("[scheduler] started: send-due every minute, check-replies hourly");
}
