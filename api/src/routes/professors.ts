import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { uid } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { HttpError, parseQuery, validateBody } from "../lib/http.js";
import { CONTACT_KINDS, PROFESSOR_STATUSES, emailStr, optStr, reqStr } from "../services/core/schemas.js";

export const professorsRouter = Router();

const listQuery = z.object({
  status: z.enum(PROFESSOR_STATUSES).optional().or(z.literal("").transform(() => undefined)),
  kind: z.enum(CONTACT_KINDS).optional().or(z.literal("").transform(() => undefined)),
  country: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

professorsRouter.get("/", async (req, res) => {
  const { status, kind, country, q } = parseQuery(listQuery, req.query);
  const where: Prisma.ProfessorWhereInput = { userId: uid(req) };
  if (status) where.status = status;
  if (kind) where.kind = kind;
  if (country) where.country = country;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { university: { contains: q, mode: "insensitive" } },
      { role: { contains: q, mode: "insensitive" } },
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

professorsRouter.get("/countries", async (req, res) => {
  const rows = await prisma.professor.findMany({
    where: { userId: uid(req), country: { not: null } },
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
  const prof = await prisma.professor.findFirst({
    where: { id: req.params.id, userId: uid(req) },
    include: { emails: { orderBy: { scheduledAt: "asc" } } },
  });
  if (!prof) throw new HttpError(404, "Contact not found");
  res.json(prof);
});

async function getOwnedOr404(userId: string, id: string) {
  const p = await prisma.professor.findFirst({ where: { id, userId }, select: { id: true } });
  if (!p) throw new HttpError(404, "Contact not found");
  return p;
}

/** Optional http(s) URL (trimmed; "" becomes null). */
const optUrl = optStr.refine((v) => v == null || /^https?:\/\/\S+$/i.test(v), "Must be an http(s) URL");

const createSchema = z.object({
  kind: z.enum(CONTACT_KINDS).optional(),
  name: reqStr,
  email: emailStr,
  university: reqStr,
  role: optStr,
  jobUrl: optUrl,
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
  const userId = uid(req);
  const exists = await prisma.professor.findUnique({
    where: { userId_email: { userId, email: data.email } },
    select: { id: true },
  });
  if (exists) throw new HttpError(409, "A contact with this email already exists", { id: exists.id });
  const prof = await prisma.professor.create({ data: { ...data, userId } });
  res.status(201).json(prof);
});

professorsRouter.patch("/:id", validateBody(patchSchema), async (req, res) => {
  const data = req.body as z.infer<typeof patchSchema>;
  const id = req.params.id as string;
  const userId = uid(req);
  await getOwnedOr404(userId, id);
  if (data.email) {
    const other = await prisma.professor.findUnique({
      where: { userId_email: { userId, email: data.email } },
      select: { id: true },
    });
    if (other && other.id !== id) throw new HttpError(409, "A contact with this email already exists", { id: other.id });
  }
  const prof = await prisma.professor.update({ where: { id, userId }, data }); // P2025 → 404
  res.json(prof);
});

professorsRouter.delete("/:id", async (req, res) => {
  const r = await prisma.professor.deleteMany({ where: { id: req.params.id, userId: uid(req) } }); // cascades emails
  if (r.count === 0) throw new HttpError(404, "Contact not found");
  res.status(204).end();
});
