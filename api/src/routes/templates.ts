import { Router } from "express";
import { z } from "zod";
import { uid } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { HttpError, parseQuery, validateBody } from "../lib/http.js";
import { PLACEHOLDERS, renderTemplate, unknownPlaceholders } from "../lib/template.js";
import { reqStr } from "../services/core/schemas.js";
import { loadSenderProfile } from "../services/core/sender.js";

export const templatesRouter = Router();

const listQuery = z.object({
  isFollowUp: z.enum(["true", "false", ""]).optional(),
});

templatesRouter.get("/", async (req, res) => {
  const { isFollowUp } = parseQuery(listQuery, req.query);
  const templates = await prisma.template.findMany({
    where: {
      userId: uid(req),
      ...(isFollowUp === "true" || isFollowUp === "false" ? { isFollowUp: isFollowUp === "true" } : {}),
    },
    orderBy: { name: "asc" },
  });
  res.json(templates);
});

templatesRouter.get("/:id", async (req, res) => {
  const t = await prisma.template.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!t) throw new HttpError(404, "Template not found");
  res.json(t);
});

// Body text is not trimmed (leading/trailing whitespace may be intentional), but must not be blank.
const bodyStr = z.string().refine((s) => s.trim() !== "", "Required");

const createSchema = z.object({
  name: reqStr,
  subject: reqStr,
  body: bodyStr,
  isFollowUp: z.boolean().optional(),
  isHtml: z.boolean().optional(),
  attachCv: z.boolean().optional(),
});
const patchSchema = createSchema.partial();

function assertPlaceholders(subject?: string, body?: string) {
  const unknown = [...new Set([...unknownPlaceholders(subject ?? ""), ...unknownPlaceholders(body ?? "")])];
  if (unknown.length) {
    throw new HttpError(400, `Unknown placeholder(s): ${unknown.map((u) => `{{${u}}}`).join(", ")}`, {
      unknownPlaceholders: unknown,
      allowed: [...PLACEHOLDERS],
    });
  }
}

templatesRouter.post("/", validateBody(createSchema), async (req, res) => {
  const data = req.body as z.infer<typeof createSchema>;
  assertPlaceholders(data.subject, data.body);
  const t = await prisma.template.create({ data: { ...data, userId: uid(req) } });
  res.status(201).json(t);
});

templatesRouter.patch("/:id", validateBody(patchSchema), async (req, res) => {
  const data = req.body as z.infer<typeof patchSchema>;
  assertPlaceholders(data.subject, data.body);
  const t = await prisma.template.update({ where: { id: req.params.id as string, userId: uid(req) }, data }); // P2025 → 404
  res.json(t);
});

templatesRouter.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const userId = uid(req);
  const [deleted] = await prisma.$transaction([
    prisma.template.deleteMany({ where: { id, userId } }), // emails.templateId → SetNull via FK
    // Settings follow-up template ids have no FK; clear them if they pointed at this template.
    prisma.settings.updateMany({ where: { userId, followUpTemplateId: id }, data: { followUpTemplateId: null } }),
    prisma.settings.updateMany({
      where: { userId, companyFollowUpTemplateId: id },
      data: { companyFollowUpTemplateId: null },
    }),
  ]);
  if (deleted.count === 0) throw new HttpError(404, "Template not found");
  res.status(204).end();
});

const previewSchema = z.object({ professorId: reqStr });

templatesRouter.post("/:id/preview", validateBody(previewSchema), async (req, res) => {
  const { professorId } = req.body as z.infer<typeof previewSchema>;
  const userId = uid(req);
  const [t, p, sender] = await Promise.all([
    prisma.template.findFirst({ where: { id: req.params.id as string, userId } }),
    prisma.professor.findFirst({ where: { id: professorId, userId } }),
    loadSenderProfile(userId),
  ]);
  if (!t) throw new HttpError(404, "Template not found");
  if (!p) throw new HttpError(404, "Contact not found");
  res.json({
    subject: renderTemplate(t.subject, { ...p, sender }),
    body: renderTemplate(t.body, { ...p, sender }, { html: t.isHtml }),
    isHtml: t.isHtml,
  });
});
