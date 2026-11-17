import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError, parseQuery, validateBody } from "../lib/http.js";
import { renderTemplate, unknownPlaceholders } from "../lib/template.js";
import { reqStr } from "../services/core/schemas.js";

export const templatesRouter = Router();

const listQuery = z.object({
  isFollowUp: z.enum(["true", "false", ""]).optional(),
});

templatesRouter.get("/", async (req, res) => {
  const { isFollowUp } = parseQuery(listQuery, req.query);
  const templates = await prisma.template.findMany({
    where: isFollowUp === "true" || isFollowUp === "false" ? { isFollowUp: isFollowUp === "true" } : {},
    orderBy: { name: "asc" },
  });
  res.json(templates);
});

templatesRouter.get("/:id", async (req, res) => {
  const t = await prisma.template.findUnique({ where: { id: req.params.id } });
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
});
const patchSchema = createSchema.partial();

function assertPlaceholders(subject?: string, body?: string) {
  const unknown = [...new Set([...unknownPlaceholders(subject ?? ""), ...unknownPlaceholders(body ?? "")])];
  if (unknown.length) {
    throw new HttpError(400, `Unknown placeholder(s): ${unknown.map((u) => `{{${u}}}`).join(", ")}`, {
      unknownPlaceholders: unknown,
      allowed: ["name", "university", "researchFocus", "whyFits"],
    });
  }
}

templatesRouter.post("/", validateBody(createSchema), async (req, res) => {
  const data = req.body as z.infer<typeof createSchema>;
  assertPlaceholders(data.subject, data.body);
  const t = await prisma.template.create({ data });
  res.status(201).json(t);
});

templatesRouter.patch("/:id", validateBody(patchSchema), async (req, res) => {
  const data = req.body as z.infer<typeof patchSchema>;
  assertPlaceholders(data.subject, data.body);
  const t = await prisma.template.update({ where: { id: req.params.id as string }, data }); // P2025 → 404
  res.json(t);
});

templatesRouter.delete("/:id", async (req, res) => {
  const id = req.params.id;
  await prisma.$transaction([
    prisma.template.delete({ where: { id } }), // emails.templateId → SetNull via FK
    // Settings.followUpTemplateId has no FK; clear it if it pointed at this template.
    prisma.settings.updateMany({ where: { followUpTemplateId: id }, data: { followUpTemplateId: null } }),
  ]);
  res.status(204).end();
});

const previewSchema = z.object({ professorId: reqStr });

templatesRouter.post("/:id/preview", validateBody(previewSchema), async (req, res) => {
  const { professorId } = req.body as z.infer<typeof previewSchema>;
  const [t, p] = await Promise.all([
    prisma.template.findUnique({ where: { id: req.params.id as string } }),
    prisma.professor.findUnique({ where: { id: professorId } }),
  ]);
  if (!t) throw new HttpError(404, "Template not found");
  if (!p) throw new HttpError(404, "Professor not found");
  res.json({ subject: renderTemplate(t.subject, p), body: renderTemplate(t.body, p) });
});
