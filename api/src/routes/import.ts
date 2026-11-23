import { Router, type RequestHandler } from "express";
import multer from "multer";
import Papa from "papaparse";
import { z } from "zod";
import { uid } from "../lib/auth.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError, validateBody } from "../lib/http.js";
import {
  IMPORT_COLUMNS,
  ImportParseError,
  MAX_IMPORT_ROWS,
  parseImportFile,
  type ImportRowData,
  type ParsedRow,
} from "../services/import/parse.js";
import {
  normalizeEmail,
  rowUniversity,
  validateImportRows,
  type ExistingProfessorInfo,
  type ImportTemplate,
} from "../services/import/validate.js";
import { loadSenderProfile } from "../services/core/sender.js";

export const importRouter = Router();

const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies over 4.5 MB
const CSV_MIMES = new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"]);
const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/zip",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok =
      (name.endsWith(".csv") && (CSV_MIMES.has(file.mimetype) || file.mimetype === "")) ||
      (name.endsWith(".xlsx") && (XLSX_MIMES.has(file.mimetype) || file.mimetype === ""));
    if (ok) cb(null, true);
    else cb(new HttpError(400, "Only .csv and .xlsx files are accepted"));
  },
});

/** multer wrapper that turns upload errors into 400s. */
const uploadFile: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof HttpError) return next(err);
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 4 MB)" : `Upload error: ${err.message}`;
      return next(new HttpError(400, msg));
    }
    next(err);
  });
};

async function loadTemplate(userId: string, templateId: string | undefined): Promise<ImportTemplate | null> {
  if (!templateId) return null;
  const t = await prisma.template.findFirst({
    where: { id: templateId, userId },
    select: { subject: true, body: true, isHtml: true, attachCv: true },
  });
  if (!t) throw new HttpError(400, "Template not found", { templateId });
  return t;
}

/**
 * Existing professors for the file's emails, with what the re-import rules need: status, whether an
 * email is already SCHEDULED/SENDING, and when the first email (followUpNo 0) was SENT.
 */
async function existingProfessors(
  db: Prisma.TransactionClient,
  userId: string,
  rows: ParsedRow[],
): Promise<Map<string, ExistingProfessorInfo>> {
  const emails = [...new Set(rows.map((r) => normalizeEmail(r.data.email)).filter(Boolean))];
  if (emails.length === 0) return new Map();
  const found = await db.professor.findMany({
    where: { userId, email: { in: emails } },
    select: {
      email: true,
      status: true,
      emails: {
        where: { OR: [{ status: { in: ["SCHEDULED", "SENDING"] } }, { status: "SENT", followUpNo: 0 }] },
        select: { status: true, sentAt: true },
      },
    },
  });
  return new Map(
    found.map((p) => {
      const firstSent = p.emails
        .filter((e) => e.status === "SENT" && e.sentAt)
        .map((e) => e.sentAt!)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      return [
        p.email,
        {
          status: p.status,
          hasPendingEmail: p.emails.some((e) => e.status === "SCHEDULED" || e.status === "SENDING"),
          firstSentAt: firstSent ?? null,
        },
      ];
    }),
  );
}

// ---- GET /import/sample.csv ----
/** `type` query / form field / body value → kind (undefined = mixed import). */
function expectedKindOf(v: unknown): "PROFESSOR" | "COMPANY" | undefined {
  const t = typeof v === "string" ? v.trim().toLowerCase() : "";
  return t === "company" ? "COMPANY" : t === "professor" ? "PROFESSOR" : undefined;
}

// Columns of the per-kind samples (`skills` is read as researchFocus).
const PROFESSOR_SAMPLE_COLUMNS = ["name", "email", "university", "country", "researchFocus", "whyFits", "profileUrl", "subject", "body", "scheduledAt"] as const;
const COMPANY_SAMPLE_COLUMNS = ["company", "role", "name", "email", "jobUrl", "country", "skills", "whyFits", "subject", "body", "scheduledAt"] as const;

importRouter.get("/sample.csv", (req, res) => {
  const only = expectedKindOf(req.query.type);
  const rows: ImportRowData[] = [
    {
      type: "professor",
      company: "",
      role: "",
      jobUrl: "",
      name: "Dr. Ada Example",
      email: "ada.example@cs.example.edu",
      university: "Example State University",
      country: "Germany",
      researchFocus: "graph neural networks",
      whyFits: "my thesis used GNNs for traffic forecasting",
      profileUrl: "https://cs.example.edu/~ada",
      subject: "Prospective Master's student interested in {{researchFocus}}",
      body:
        "Dear {{name}},\n\nI am applying to the Master's program at {{university}} and am very interested in your work on {{researchFocus}}. {{whyFits}}.\n\nBest regards,\nYour Name",
      scheduledAt: "2026-11-20 09:30",
    },
    {
      type: "professor",
      company: "",
      role: "",
      jobUrl: "",
      name: "Prof. Ben Sample",
      email: "b.sample@physics.example.edu",
      university: "University of Example",
      country: "Canada",
      researchFocus: "quantum error correction",
      whyFits: "I completed a research project on surface codes",
      profileUrl: "https://physics.example.edu/people/bsample",
      subject: "Master's admission inquiry",
      body: "Dear Prof. Sample,\n\nI would love to discuss Master's opportunities in your group.\n\nKind regards,\nYour Name",
      scheduledAt: "2026-11-20 10:15",
    },
    {
      type: "",
      company: "",
      role: "",
      jobUrl: "",
      name: "Dr. Chloe Placeholder",
      email: "chloe.placeholder@eng.example.edu",
      university: "Example Institute of Technology",
      country: "Netherlands",
      researchFocus: "robot motion planning",
      whyFits: "my final-year project was a planner for warehouse robots",
      profileUrl: "",
      subject: "",
      body: "",
      scheduledAt: "2026-11-21 14:00",
    },
    {
      type: "company",
      name: "Hiring Team",
      email: "careers@robotics.example.com",
      university: "",
      company: "Example Robotics GmbH",
      role: "Junior Machine Learning Engineer",
      jobUrl: "https://robotics.example.com/jobs/ml-engineer",
      country: "Germany",
      researchFocus: "Python, PyTorch, ROS",
      whyFits: "I built a perception pipeline for warehouse robots in my final-year project",
      profileUrl: "",
      subject: "Application: {{role}} at {{company}}",
      body:
        "Dear {{name}},\n\nI am writing to apply for the {{role}} position at {{company}} ({{jobUrl}}). {{whyFits}}.\n\nMy CV is attached.\n\nBest regards,\nYour Name",
      scheduledAt: "2026-11-22 11:00",
    },
  ];
  let csv: string;
  let filename = "prof-mailer-sample.csv";
  if (only === "COMPANY") {
    const companies: ImportRowData[] = [
      ...rows.filter((r) => r.type === "company"),
      {
        ...rows.find((r) => r.type === "company")!,
        name: "Sara Recruiter",
        email: "sara.recruiter@cloudsoft.example.com",
        company: "CloudSoft Example Ltd",
        role: "Backend Developer (Node.js)",
        jobUrl: "https://cloudsoft.example.com/careers/backend",
        country: "Netherlands",
        researchFocus: "Node.js, TypeScript, PostgreSQL",
        whyFits: "I built and deployed a multi-user email scheduling app with Express and Postgres",
        subject: "Application for {{role}}",
        body:
          "Dear {{name}},\n\nI would like to apply for the {{role}} role at {{company}}. {{whyFits}}.\n\nI have attached my CV and would be glad to talk.\n\nKind regards,\nYour Name",
        scheduledAt: "2026-11-22 11:30",
      },
    ];
    csv = Papa.unparse({
      fields: [...COMPANY_SAMPLE_COLUMNS],
      data: companies.map((r) => COMPANY_SAMPLE_COLUMNS.map((c) => (c === "skills" ? r.researchFocus : r[c]))),
    });
    filename = "prof-mailer-companies-sample.csv";
  } else if (only === "PROFESSOR") {
    csv = Papa.unparse({
      fields: [...PROFESSOR_SAMPLE_COLUMNS],
      data: rows.filter((r) => r.type !== "company").map((r) => PROFESSOR_SAMPLE_COLUMNS.map((c) => r[c])),
    });
    filename = "prof-mailer-professors-sample.csv";
  } else {
    csv = Papa.unparse({ fields: [...IMPORT_COLUMNS], data: rows.map((r) => IMPORT_COLUMNS.map((c) => r[c])) });
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ---- POST /import/preview ----
importRouter.post("/preview", uploadFile, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'No file uploaded (multipart field "file")');
  const rawTemplateId: unknown = req.body?.templateId;
  const templateId = typeof rawTemplateId === "string" && rawTemplateId.trim() ? rawTemplateId.trim() : undefined;

  const userId = uid(req);
  const template = await loadTemplate(userId, templateId);
  let parsed: ParsedRow[];
  try {
    parsed = parseImportFile(file.buffer, file.originalname);
  } catch (e) {
    if (e instanceof ImportParseError) throw new HttpError(400, e.message);
    throw e;
  }
  const rows = validateImportRows(
    parsed,
    template,
    await existingProfessors(prisma, userId, parsed),
    expectedKindOf(req.body?.type),
    await loadSenderProfile(userId),
  );
  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  res.json({ rows, validCount: rows.length - errorCount, errorCount });
});

// ---- POST /import/commit ----
const cell = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null ? "" : String(v).trim()));

const rowSchema = z
  .object({
    ...(Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, cell])) as Record<(typeof IMPORT_COLUMNS)[number], typeof cell>),
    kind: cell, // alias of `type`
  })
  .transform(({ kind, ...r }) => ({ ...r, type: r.type || kind }));

const commitSchema = z.object({
  rows: z.array(rowSchema).max(MAX_IMPORT_ROWS),
  templateId: z.string().trim().nullish(),
  /** Overrides the template's attachCv for every row. */
  attachCv: z.boolean().optional(),
  /** "professor" | "company": the page the import was started from (see validateImportRows). */
  type: z.enum(["professor", "company"]).optional(),
});

importRouter.post("/commit", validateBody(commitSchema), async (req, res) => {
  const body = req.body as z.infer<typeof commitSchema>;
  const userId = uid(req);
  const template = await loadTemplate(userId, body.templateId || undefined);

  const parsed: ParsedRow[] = body.rows.map((data, i) => ({ rowNumber: i + 2, data }));
  const templateId = body.templateId || null;
  const attachCv = body.attachCv ?? template?.attachCv ?? false;
  const sender = await loadSenderProfile(userId);

  const result = await prisma.$transaction(
    async (tx) => {
      // Re-validate against the DB inside the transaction (same rules as the preview, incl. re-import errors).
      const existing = await existingProfessors(tx, userId, parsed);
      const valid = validateImportRows(parsed, template, existing, expectedKindOf(body.type), sender).filter((r) => r.errors.length === 0);
      let professorsCreated = 0;
      let professorsUpdated = 0;
      let emailsCreated = 0;
      for (const row of valid) {
        const d = row.data;
        const email = normalizeEmail(d.email);
        // Required fields always update; optional ones only when the row provides a value
        // (so a sparse re-import does not wipe existing profile data).
        const optional = {
          ...(d.country ? { country: d.country } : {}),
          ...(d.researchFocus ? { researchFocus: d.researchFocus } : {}),
          ...(d.whyFits ? { whyFits: d.whyFits } : {}),
          ...(d.profileUrl ? { profileUrl: d.profileUrl } : {}),
          ...(row.role ? { role: row.role } : {}),
          ...(row.jobUrl ? { jobUrl: row.jobUrl } : {}),
        };
        const required = { name: d.name, university: rowUniversity(d), kind: row.kind };
        const prof = await tx.professor.upsert({
          where: { userId_email: { userId, email } },
          create: { userId, email, ...required, ...optional },
          update: { ...required, ...optional },
          select: { id: true },
        });
        if (existing.has(email)) professorsUpdated++;
        else professorsCreated++;

        await tx.email.create({
          data: {
            userId,
            professorId: prof.id,
            templateId,
            subject: row.subject,
            body: row.body,
            isHtml: row.isHtml,
            attachCv,
            status: "SCHEDULED",
            scheduledAt: new Date(row.scheduledAtUtc!),
            followUpNo: 0,
          },
        });
        emailsCreated++;
      }
      return { professorsCreated, professorsUpdated, emailsCreated };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  res.json(result);
});
