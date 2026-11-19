import { Router, type RequestHandler } from "express";
import multer from "multer";
import { uid } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http.js";

/** The user's CV (one per user, stored as bytes), attached to emails with attachCv. */
export const cvRouter = Router();

const MAX_BYTES = 5 * 1024 * 1024;
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
      const msg = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5 MB)" : `Upload error: ${err.message}`;
      return next(new HttpError(400, msg));
    }
    next(err);
  });
};

const cvMeta = { filename: true, mimeType: true, size: true, updatedAt: true } as const;

cvRouter.get("/", async (req, res) => {
  const cv = await prisma.userCv.findUnique({ where: { userId: uid(req) }, select: cvMeta });
  res.json({ cv });
});

cvRouter.post("/", uploadFile, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'No file uploaded (multipart field "file")');
  if (file.size === 0 || file.buffer.length === 0) throw new HttpError(400, "The file is empty");
  const ext = extOf(file.originalname);
  const type = TYPES[ext];
  if (!type || !type.magic.every((b, i) => file.buffer[i] === b)) throw new HttpError(400, TYPE_ERROR);

  const userId = uid(req);
  const data = {
    filename: sanitizeFilename(file.originalname, ext),
    mimeType: type.mime,
    size: file.buffer.length,
    data: new Uint8Array(file.buffer),
  };
  const cv = await prisma.userCv.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: cvMeta,
  });
  res.json({ cv });
});

cvRouter.get("/download", async (req, res) => {
  const cv = await prisma.userCv.findUnique({ where: { userId: uid(req) } });
  if (!cv) throw new HttpError(404, "No CV uploaded");
  res.attachment(cv.filename);
  res.setHeader("Content-Type", cv.mimeType);
  res.setHeader("Content-Length", String(cv.size));
  res.setHeader("Cache-Control", "private, no-store");
  res.end(Buffer.from(cv.data));
});

cvRouter.delete("/", async (req, res) => {
  await prisma.userCv.deleteMany({ where: { userId: uid(req) } });
  res.status(204).end();
});
