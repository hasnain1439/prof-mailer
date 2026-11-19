import { Router } from "express";
import { z } from "zod";
import { uid } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { MAX_DAILY_SEND_LIMIT } from "../lib/settings.js";
import { HttpError, validateBody } from "../lib/http.js";
import { buildSettingsResponse } from "../services/core/settings.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (req, res) => {
  res.json(await buildSettingsResponse(uid(req)));
});

const templateIdStr = z
  .string()
  .trim()
  .nullable()
  .transform((v) => (v === "" ? null : v));

const putSchema = z.object({
  followUpAfterDays: z.number().int().min(1).max(60),
  maxFollowUps: z.number().int().min(0).max(10),
  // Any positive integer is accepted and capped server-side at MAX_DAILY_SEND_LIMIT (50).
  dailySendLimit: z
    .number()
    .int()
    .min(1)
    .transform((n) => Math.min(n, MAX_DAILY_SEND_LIMIT)),
  followUpTemplateId: templateIdStr,
  // Optional for older clients: omitted = unchanged.
  companyFollowUpTemplateId: templateIdStr.optional(),
});

async function assertFollowUpTemplate(userId: string, id: string, label: string) {
  const t = await prisma.template.findFirst({ where: { id, userId }, select: { isFollowUp: true } });
  if (!t) throw new HttpError(400, `${label} not found`);
  if (!t.isFollowUp) throw new HttpError(400, "Selected template is not marked as a follow-up template");
}

settingsRouter.put("/", validateBody(putSchema), async (req, res) => {
  const data = req.body as z.infer<typeof putSchema>;
  const userId = uid(req);
  if (data.followUpTemplateId) await assertFollowUpTemplate(userId, data.followUpTemplateId, "Follow-up template");
  if (data.companyFollowUpTemplateId) {
    await assertFollowUpTemplate(userId, data.companyFollowUpTemplateId, "Company follow-up template");
  }
  await prisma.settings.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  res.json(await buildSettingsResponse(userId));
});
