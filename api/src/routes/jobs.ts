import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { safeEqual } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { HttpError } from "../lib/http.js";
import { runCheckReplies } from "../jobs/checkReplies.js";
import { runTick } from "../jobs/index.js";
import { runSendDue } from "../jobs/sendDue.js";

/** Cron endpoints. Authenticated with `Authorization: Bearer ${CRON_SECRET}`, never with a user session. */
export const jobsRouter = Router();

const requireCronSecret: RequestHandler = (req, _res, next) => {
  // Empty CRON_SECRET (dev only; production refuses to start without it) disables these endpoints.
  if (!env.CRON_SECRET) return next(new HttpError(401, "Unauthorized"));
  const m = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "");
  if (!m || !safeEqual(m[1]!.trim(), env.CRON_SECRET)) return next(new HttpError(401, "Unauthorized"));
  next();
};

jobsRouter.use(requireCronSecret);

const bodySchema = z.object({ now: z.iso.datetime({ offset: true }).optional() });

/** `now` is honoured only in DRY_RUN; otherwise the real clock is used. */
function resolveNow(body: unknown): Date {
  const r = bodySchema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, "Validation failed", z.flattenError(r.error));
  if (r.data.now && env.DRY_RUN) return new Date(r.data.now);
  return new Date();
}

const tick: RequestHandler = async (_req, res) => {
  res.json(await runTick());
};
jobsRouter.get("/tick", tick);
jobsRouter.post("/tick", tick);

jobsRouter.post("/send-due", async (req, res) => {
  res.json(await runSendDue(resolveNow(req.body)));
});

jobsRouter.post("/check-replies", async (req, res) => {
  res.json(await runCheckReplies(resolveNow(req.body)));
});
