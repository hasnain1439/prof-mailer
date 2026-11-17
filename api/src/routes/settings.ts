import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError, validateBody } from "../lib/http.js";
import { buildSettingsResponse } from "../services/core/settings.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  res.json(await buildSettingsResponse());
});

const putSchema = z.object({
  followUpAfterDays: z.number().int().min(1).max(60),
  maxFollowUps: z.number().int().min(0).max(10),
  dailySendLimit: z.number().int().min(1).max(500),
  followUpTemplateId: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
});

settingsRouter.put("/", validateBody(putSchema), async (req, res) => {
  const data = req.body as z.infer<typeof putSchema>;
  if (data.followUpTemplateId) {
    const t = await prisma.template.findUnique({
      where: { id: data.followUpTemplateId },
      select: { isFollowUp: true },
    });
    if (!t) throw new HttpError(400, "Follow-up template not found");
    if (!t.isFollowUp) throw new HttpError(400, "Selected template is not marked as a follow-up template");
  }
  await prisma.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  res.json(await buildSettingsResponse());
});
