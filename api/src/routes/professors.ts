import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError, parseQuery, validateBody } from "../lib/http.js";
import { PROFESSOR_STATUSES, emailStr, optStr, reqStr } from "../services/core/schemas.js";

export const professorsRouter = Router();

const listQuery = z.object({
  status: z.enum(PROFESSOR_STATUSES).optional().or(z.literal("").transform(() => undefined)),
  country: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

professorsRouter.get("/", async (req, res) => {
  const { status, country, q } = parseQuery(listQuery, req.query);
  const where: Prisma.ProfessorWhereInput = {};
  if (status) where.status = status;
  if (country) where.country = country;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { university: { contains: q, mode: "insensitive" } },
    ];
  }
  const profs = await prisma.professor.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { emails: { select: { status: true, sentAt: true, scheduledAt: true } } },
  });
  res.json(
    profs.map(({ emails, ...p }) => {
      let lastSentAt: Date | null = null;
      let nextScheduledAt: Date | null = null;
      for (const e of emails) {
        if (e.sentAt && (!lastSentAt || e.sentAt > lastSentAt)) lastSentAt = e.sentAt;
        if (e.status === "SCHEDULED" && (!nextScheduledAt || e.scheduledAt < nextScheduledAt)) {
          nextScheduledAt = e.scheduledAt;
        }
      }
      return { ...p, emailCount: emails.length, lastSentAt, nextScheduledAt };
    }),
  );
});

professorsRouter.get("/countries", async (_req, res) => {
  const rows = await prisma.professor.findMany({
    where: { country: { not: null } },
    distinct: ["country"],
    select: { country: true },
  });
  const countries = rows
    .map((r) => r.country)
    .filter((c): c is string => !!c && c.trim() !== "")
    .sort((a, b) => a.localeCompare(b));
  res.json(countries);
});

professorsRouter.get("/:id", async (req, res) => {
  const prof = await prisma.professor.findUnique({
    where: { id: req.params.id },
    include: { emails: { orderBy: { scheduledAt: "asc" } } },
  });
  if (!prof) throw new HttpError(404, "Professor not found");
  res.json(prof);
});

const createSchema = z.object({
  name: reqStr,
  email: emailStr,
  university: reqStr,
  country: optStr,
  researchFocus: optStr,
  whyFits: optStr,
  profileUrl: optStr,
  status: z.enum(PROFESSOR_STATUSES).optional(),
  notes: optStr,
});
const patchSchema = createSchema.partial();

professorsRouter.post("/", validateBody(createSchema), async (req, res) => {
  const data = req.body as z.infer<typeof createSchema>;
  const exists = await prisma.professor.findUnique({ where: { email: data.email }, select: { id: true } });
  if (exists) throw new HttpError(409, "A professor with this email already exists", { id: exists.id });
  const prof = await prisma.professor.create({ data });
  res.status(201).json(prof);
});

professorsRouter.patch("/:id", validateBody(patchSchema), async (req, res) => {
  const data = req.body as z.infer<typeof patchSchema>;
  const id = req.params.id as string;
  if (data.email) {
    const other = await prisma.professor.findUnique({ where: { email: data.email }, select: { id: true } });
    if (other && other.id !== id) throw new HttpError(409, "A professor with this email already exists", { id: other.id });
  }
  const prof = await prisma.professor.update({ where: { id }, data }); // P2025 → 404
  res.json(prof);
});

professorsRouter.delete("/:id", async (req, res) => {
  await prisma.professor.delete({ where: { id: req.params.id } }); // cascades emails
  res.status(204).end();
});
