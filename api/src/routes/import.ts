import { Router, type RequestHandler } from "express";
import multer from "multer";
import Papa from "papaparse";
import { z } from "zod";
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
import { normalizeEmail, validateImportRows, type ImportTemplate } from "../services/import/validate.js";

export const importRouter = Router();

const MAX_BYTES = 5 * 1024 * 1024;
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
      const msg = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5 MB)" : `Upload error: ${err.message}`;
      return next(new HttpError(400, msg));
    }
    next(err);
  });
};

async function loadTemplate(templateId: string | undefined): Promise<ImportTemplate | null> {
  if (!templateId) return null;
  const t = await prisma.template.findUnique({ where: { id: templateId }, select: { subject: true, body: true } });
  if (!t) throw new HttpError(400, "Template not found", { templateId });
  return t;
}

async function existingEmailSet(rows: ParsedRow[]): Promise<Set<string>> {
  const emails = [...new Set(rows.map((r) => normalizeEmail(r.data.email)).filter(Boolean))];
  if (emails.length === 0) return new Set();
  const found = await prisma.professor.findMany({ where: { email: { in: emails } }, select: { email: true } });
  return new Set(found.map((p) => p.email));
}

// ---- GET /import/sample.csv ----
importRouter.get("/sample.csv", (_req, res) => {
  const rows: ImportRowData[] = [
    {
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
  ];
  const csv = Papa.unparse({ fields: [...IMPORT_COLUMNS], data: rows.map((r) => IMPORT_COLUMNS.map((c) => r[c])) });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="prof-mailer-sample.csv"');
  res.send(csv);
});

// ---- POST /import/preview ----
importRouter.post("/preview", uploadFile, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'No file uploaded (multipart field "file")');
  const rawTemplateId: unknown = req.body?.templateId;
  const templateId = typeof rawTemplateId === "string" && rawTemplateId.trim() ? rawTemplateId.trim() : undefined;

  const template = await loadTemplate(templateId);
  let parsed: ParsedRow[];
  try {
    parsed = parseImportFile(file.buffer, file.originalname);
  } catch (e) {
    if (e instanceof ImportParseError) throw new HttpError(400, e.message);
    throw e;
  }
  const rows = validateImportRows(parsed, template, await existingEmailSet(parsed));
  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  res.json({ rows, validCount: rows.length - errorCount, errorCount });
});

// ---- POST /import/commit ----
const cell = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null ? "" : String(v).trim()));

const rowSchema = z.object(
  Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, cell])) as Record<(typeof IMPORT_COLUMNS)[number], typeof cell>,
);

const commitSchema = z.object({
  rows: z.array(rowSchema).max(MAX_IMPORT_ROWS),
  templateId: z.string().trim().nullish(),
});

importRouter.post("/commit", validateBody(commitSchema), async (req, res) => {
  const body = req.body as z.infer<typeof commitSchema>;
  const template = await loadTemplate(body.templateId || undefined);

  const parsed: ParsedRow[] = body.rows.map((data, i) => ({ rowNumber: i + 2, data }));
  const existing = await existingEmailSet(parsed);
  const valid = validateImportRows(parsed, template, existing).filter((r) => r.errors.length === 0);
  const templateId = body.templateId || null;

  const result = await prisma.$transaction(
    async (tx) => {
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
        };
        const prof = await tx.professor.upsert({
          where: { email },
          create: { email, name: d.name, university: d.university, ...optional },
          update: { name: d.name, university: d.university, ...optional },
          select: { id: true },
        });
        if (existing.has(email)) professorsUpdated++;
        else professorsCreated++;

        await tx.email.create({
          data: {
            professorId: prof.id,
            templateId,
            subject: row.subject,
            body: row.body,
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
