import { Router } from "express";
import { z } from "zod";
import type { EmailStatus, Prisma } from "@prisma/client";
import { uid } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { HttpError, parseQuery, validateBody } from "../lib/http.js";
import { EMAIL_STATUSES, professorSummarySelect } from "../services/core/schemas.js";

export const emailsRouter = Router();

const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) : []))
    .pipe(z.array(z.enum(EMAIL_STATUSES))),
  professorId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

const ACTIVE: ReadonlySet<EmailStatus> = new Set(["SCHEDULED", "SENDING"]);

emailsRouter.get("/", async (req, res) => {
  const { status, professorId, limit } = parseQuery(listQuery, req.query);
  const where: Prisma.EmailWhereInput = { userId: uid(req) };
  if (status.length) where.status = { in: status };
  if (professorId) where.professorId = professorId;

  // Dataset is small; sort in JS because the ordering depends on status.
  const emails = await prisma.email.findMany({
    where,
    include: { professor: { select: professorSummarySelect } },
  });
  emails.sort((a, b) => {
    const aa = ACTIVE.has(a.status);
    const ba = ACTIVE.has(b.status);
    if (aa !== ba) return aa ? -1 : 1; // upcoming first
    if (aa) return a.scheduledAt.getTime() - b.scheduledAt.getTime();
    return (b.sentAt ?? b.updatedAt).getTime() - (a.sentAt ?? a.updatedAt).getTime();
  });
  res.json(emails.slice(0, limit));
});

async function getEmailOr404(userId: string, id: string) {
  const e = await prisma.email.findFirst({ where: { id, userId } });
  if (!e) throw new HttpError(404, "Email not found");
  return e;
}

emailsRouter.post("/:id/cancel", async (req, res) => {
  const id = req.params.id;
  const userId = uid(req);
  const e = await getEmailOr404(userId, id);
  if (e.status !== "SCHEDULED" && e.status !== "FAILED") {
    throw new HttpError(409, `Cannot cancel an email with status ${e.status}`);
  }
  // Guard against a concurrent status change (e.g. the sender picking it up).
  const r = await prisma.email.updateMany({
    where: { id, userId, status: { in: ["SCHEDULED", "FAILED"] } },
    data: { status: "CANCELLED" },
  });
  if (r.count === 0) throw new HttpError(409, "Email status changed; please refresh");
  res.json(await getEmailOr404(userId, id));
});

const patchSchema = z.object({
  scheduledAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  subject: z.string().trim().min(1).optional(),
  body: z.string().refine((s) => s.trim() !== "", "Required").optional(),
});

emailsRouter.patch("/:id", validateBody(patchSchema), async (req, res) => {
  const id = req.params.id as string;
  const { scheduledAt, subject, body } = req.body as z.infer<typeof patchSchema>;
  const userId = uid(req);
  const e = await getEmailOr404(userId, id);
  const allowed: EmailStatus[] = ["SCHEDULED", "FAILED", "CANCELLED"];
  if (!allowed.includes(e.status)) throw new HttpError(409, `Cannot reschedule an email with status ${e.status}`);
  const r = await prisma.email.updateMany({
    where: { id, userId, status: { in: allowed } },
    data: {
      scheduledAt,
      status: "SCHEDULED",
      error: null,
      ...(subject !== undefined ? { subject } : {}),
      ...(body !== undefined ? { body } : {}),
    },
  });
  if (r.count === 0) throw new HttpError(409, "Email status changed; please refresh");
  res.json(await getEmailOr404(userId, id));
});
