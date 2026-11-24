import type { ContactKind } from "@prisma/client";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { uid } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http.js";
import { deleteCvObject, findSlot, putCvObject, r2Enabled, readCv } from "../services/storage/cvStore.js";

/** The user's CVs: one for professors, one for companies and a general fallback, attached to emails with attachCv. */
export const cvRouter = Router();

const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies over 4.5 MB
const MAX_NAME = 120;

// Allowed types: extension → MIME type + magic bytes the content must start with.
const TYPES: Record<string, { mime: string; magic: number[] }> = {
  pdf: { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: [0x50, 0x4b, 0x03, 0x04], // PK\x03\x04 (zip)
  },
  doc: { mime: "application/msword", magic: [0xd0, 0xcf, 0x11, 0xe0] }, // OLE2
};
const TYPE_ERROR = "Only PDF, DOC or DOCX files are accepted";

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** Basename, no control chars, max 120 chars (extension kept). */
export function sanitizeFilename(raw: string, ext: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || base === "." || base === "..") return `cv.${ext}`;
  if (base.length <= MAX_NAME) return base;
  const suffix = `.${ext}`;
  return base.slice(0, MAX_NAME - suffix.length).trimEnd() + suffix;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (TYPES[extOf(file.originalname)]) cb(null, true);
    else cb(new HttpError(400, TYPE_ERROR));
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

const cvMeta = { kind: true, filename: true, mimeType: true, size: true, updatedAt: true } as const;

/**
 * CV slot from ?for=professor|company; anything else (or nothing) is the general CV, which is used
 * for a contact when there is no CV for its kind.
 */
function slotOf(v: unknown): ContactKind | null {
  return v === "professor" ? "PROFESSOR" : v === "company" ? "COMPANY" : null;
}


cvRouter.get("/", async (req, res) => {
  const rows = await prisma.userCv.findMany({ where: { userId: uid(req) }, select: cvMeta });
  const by = (k: ContactKind | null) => rows.find((r) => r.kind === k) ?? null;
  const cvs = { general: by(null), professor: by("PROFESSOR"), company: by("COMPANY") };
  // `cv` kept for older clients: any CV.
  res.json({ cv: cvs.general ?? cvs.professor ?? cvs.company, cvs });
});

cvRouter.post("/", uploadFile, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'No file uploaded (multipart field "file")');
  if (file.size === 0 || file.buffer.length === 0) throw new HttpError(400, "The file is empty");
  const ext = extOf(file.originalname);
  const type = TYPES[ext];
  if (!type || !type.magic.every((b, i) => file.buffer[i] === b)) throw new HttpError(400, TYPE_ERROR);

  const userId = uid(req);
  const kind = slotOf(req.query.for ?? req.body?.for);
  const previous = await findSlot(userId, kind);
  const storageKey = r2Enabled ? await putCvObject(userId, file.buffer, type.mime) : null;
  const data = {
    filename: sanitizeFilename(file.originalname, ext),
    mimeType: type.mime,
    size: file.buffer.length,
    data: storageKey ? null : new Uint8Array(file.buffer),
    storageKey,
  };
  const cv = previous
    ? await prisma.userCv.update({ where: { id: previous.id }, data, select: cvMeta })
    : await prisma.userCv.create({ data: { userId, kind, ...data }, select: cvMeta });
  if (previous?.storageKey && previous.storageKey !== storageKey) await deleteCvObject(previous.storageKey);
  res.json({ cv });
});

cvRouter.get("/download", async (req, res) => {
  const cv = await findSlot(uid(req), slotOf(req.query.for));
  if (!cv) throw new HttpError(404, "No CV uploaded");
  const body = await readCv(cv);
  res.attachment(cv.filename);
  res.setHeader("Content-Type", cv.mimeType);
  res.setHeader("Content-Length", String(body.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.end(body);
});

cvRouter.delete("/", async (req, res) => {
  const cv = await findSlot(uid(req), slotOf(req.query.for));
  if (cv) {
    await prisma.userCv.delete({ where: { id: cv.id } });
    await deleteCvObject(cv.storageKey);
  }
  res.status(204).end();
});
