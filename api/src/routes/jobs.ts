import { Router } from "express";
import { z } from "zod";
import { env } from "../lib/env.js";
import { HttpError } from "../lib/http.js";
import { runCheckReplies } from "../jobs/checkReplies.js";
import { runSendDue } from "../jobs/sendDue.js";

export const jobsRouter = Router();

const bodySchema = z.object({ now: z.iso.datetime({ offset: true }).optional() });

/** `now` is honoured only in DRY_RUN; otherwise the real clock is used. */
function resolveNow(body: unknown): Date {
  const r = bodySchema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, "Validation failed", z.flattenError(r.error));
  if (r.data.now && env.DRY_RUN) return new Date(r.data.now);
  return new Date();
}

jobsRouter.post("/send-due", async (req, res) => {
  res.json(await runSendDue(resolveNow(req.body)));
});

jobsRouter.post("/check-replies", async (req, res) => {
  res.json(await runCheckReplies(resolveNow(req.body)));
});
