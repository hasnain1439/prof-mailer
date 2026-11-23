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

const patchSchema = z
  .object({
    scheduledAt: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .optional(),
    subject: z.string().trim().min(1).optional(),
    body: z.string().refine((s) => s.trim() !== "", "Required").optional(),
    attachCv: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), "Nothing to update");

emailsRouter.patch("/:id", validateBody(patchSchema), async (req, res) => {
  const id = req.params.id as string;
  const { scheduledAt, subject, body, attachCv } = req.body as z.infer<typeof patchSchema>;
  const userId = uid(req);
  const e = await getEmailOr404(userId, id);
  // Rescheduling revives FAILED/CANCELLED; edits without scheduledAt only apply to SCHEDULED emails.
  const allowed: EmailStatus[] = scheduledAt ? ["SCHEDULED", "FAILED", "CANCELLED"] : ["SCHEDULED"];
  if (!allowed.includes(e.status)) {
    throw new HttpError(409, `Cannot ${scheduledAt ? "reschedule" : "edit"} an email with status ${e.status}`);
  }
  const r = await prisma.email.updateMany({
    where: { id, userId, status: { in: allowed } },
    data: {
      ...(scheduledAt ? { scheduledAt, status: "SCHEDULED", error: null } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(attachCv !== undefined ? { attachCv } : {}),
    },
  });
  if (r.count === 0) throw new HttpError(409, "Email status changed; please refresh");
  res.json(await getEmailOr404(userId, id));
});

// Schedule a first email to one existing contact (e.g. an AI draft the user reviewed). Same rules as
// import: one first email per contact; follow-ups are created by the reply checker, not here.
const createSchema = z.object({
  professorId: z.string().min(1),
  subject: z.string().trim().min(1).max(300),
  body: z.string().refine((s) => s.trim() !== "", "Required"),
  isHtml: z.boolean().optional(),
  attachCv: z.boolean().optional(),
  scheduledAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
});

emailsRouter.post("/", validateBody(createSchema), async (req, res) => {
  const data = req.body as z.infer<typeof createSchema>;
  const userId = uid(req);
  const prof = await prisma.professor.findFirst({ where: { id: data.professorId, userId }, select: { id: true } });
  if (!prof) throw new HttpError(404, "Contact not found");
  const existing = await prisma.email.findFirst({
    where: {
      userId,
      professorId: prof.id,
      followUpNo: 0,
      OR: [{ status: { in: ["SCHEDULED", "SENDING"] } }, { status: "SENT" }],
    },
    select: { status: true },
  });
  if (existing) {
    throw new HttpError(
      409,
      existing.status === "SENT"
        ? "This contact was already emailed; follow-ups are sent automatically"
        : "This contact already has a scheduled email; edit it in the Queue",
    );
  }
  const e = await prisma.email.create({
    data: {
      userId,
      professorId: prof.id,
      subject: data.subject,
      body: data.body,
      isHtml: data.isHtml ?? false,
      attachCv: data.attachCv ?? false,
      status: "SCHEDULED",
      scheduledAt: data.scheduledAt,
      followUpNo: 0,
    },
    include: { professor: { select: professorSummarySelect } },
  });
  res.status(201).json(e);
});
