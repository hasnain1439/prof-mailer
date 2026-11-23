import { Router } from "express";
import { z } from "zod";
import { uid } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { HttpError, parseQuery, validateBody } from "../lib/http.js";
import { optStr, professorSummarySelect, reqStr } from "../services/core/schemas.js";

export const remindersRouter = Router();

const include = { contact: { select: professorSummarySelect } } as const;

const listQuery = z.object({
  // open: not done (overdue first, then upcoming); due: not done and dueAt <= now; done: completed.
  status: z.enum(["open", "due", "done", "all", ""]).optional(),
  contactId: z.string().optional(),
});

remindersRouter.get("/", async (req, res) => {
  const { status = "open", contactId } = parseQuery(listQuery, req.query);
  const userId = uid(req);
  const where = {
    userId,
    ...(contactId ? { contactId } : {}),
    ...(status === "open" || status === "" ? { doneAt: null } : {}),
    ...(status === "due" ? { doneAt: null, dueAt: { lte: new Date() } } : {}),
    ...(status === "done" ? { doneAt: { not: null } } : {}),
  };
  const reminders = await prisma.reminder.findMany({
    where,
    include,
    orderBy: status === "done" ? { doneAt: "desc" } : { dueAt: "asc" },
    take: 500,
  });
  res.json(reminders);
});

const dueAt = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

const createSchema = z.object({
  title: reqStr.max(200),
  note: optStr,
  dueAt,
  contactId: z.string().min(1).nullish(),
});

const patchSchema = z.object({
  title: reqStr.max(200).optional(),
  note: optStr,
  dueAt: dueAt.optional(),
  contactId: z.string().min(1).nullish(),
  done: z.boolean().optional(),
});

async function assertContact(userId: string, contactId: string | null | undefined) {
  if (!contactId) return;
  const c = await prisma.professor.findFirst({ where: { id: contactId, userId }, select: { id: true } });
  if (!c) throw new HttpError(404, "Contact not found");
}

remindersRouter.post("/", validateBody(createSchema), async (req, res) => {
  const data = req.body as z.infer<typeof createSchema>;
  const userId = uid(req);
  await assertContact(userId, data.contactId);
  const r = await prisma.reminder.create({
    data: { userId, title: data.title, note: data.note ?? null, dueAt: data.dueAt, contactId: data.contactId ?? null },
    include,
  });
  res.status(201).json(r);
});

remindersRouter.patch("/:id", validateBody(patchSchema), async (req, res) => {
  const data = req.body as z.infer<typeof patchSchema>;
  const userId = uid(req);
  const id = req.params.id as string;
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, "Reminder not found");
  await assertContact(userId, data.contactId);
  const r = await prisma.reminder.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
      ...(data.contactId !== undefined ? { contactId: data.contactId } : {}),
      // A new due time means a new notification.
      ...(data.dueAt ? { dueAt: data.dueAt, notifiedAt: null } : {}),
      ...(data.done !== undefined ? { doneAt: data.done ? (existing.doneAt ?? new Date()) : null } : {}),
    },
    include,
  });
  res.json(r);
});

remindersRouter.delete("/:id", async (req, res) => {
  const r = await prisma.reminder.deleteMany({ where: { id: req.params.id, userId: uid(req) } });
  if (r.count === 0) throw new HttpError(404, "Reminder not found");
  res.status(204).end();
});
