/**
 * Extra documents besides the CV (transcript, cover letter, ...). A template or email lists the ones
 * to attach in attachFileIds. Same file types, size limit and storage (database or R2) as the CV.
 */
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { uid } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { deleteCvObject, putFileObject, r2Enabled, readCv } from "../services/storage/cvStore.js";
import { MAX_BYTES, TYPES, TYPE_ERROR, extOf, sanitizeFilename } from "./cv.js";

export const filesRouter = Router();

const MAX_FILES = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (TYPES[extOf(file.originalname)]) cb(null, true);
    else cb(new HttpError(400, TYPE_ERROR));
  },
});

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

const meta = { id: true, label: true, filename: true, mimeType: true, size: true, createdAt: true } as const;

filesRouter.get("/", async (req, res) => {
  res.json(await prisma.userFile.findMany({ where: { userId: uid(req) }, select: meta, orderBy: { createdAt: "asc" } }));
});

filesRouter.post("/", uploadFile, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'No file uploaded (multipart field "file")');
  if (file.size === 0 || file.buffer.length === 0) throw new HttpError(400, "The file is empty");
  const ext = extOf(file.originalname);
  const type = TYPES[ext];
  if (!type || !type.magic.every((b, i) => file.buffer[i] === b)) throw new HttpError(400, TYPE_ERROR);
  const rawLabel = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  const label = (rawLabel || file.originalname.replace(/\.[^.]+$/, "")).slice(0, 60);

  const userId = uid(req);
  if ((await prisma.userFile.count({ where: { userId } })) >= MAX_FILES) {
    throw new HttpError(400, `You can keep up to ${MAX_FILES} documents; remove one first`);
  }
  const storageKey = r2Enabled ? await putFileObject(userId, file.buffer, type.mime) : null;
  const created = await prisma.userFile.create({
    data: {
      userId,
      label,
      filename: sanitizeFilename(file.originalname, ext),
      mimeType: type.mime,
      size: file.buffer.length,
      data: storageKey ? null : new Uint8Array(file.buffer),
      storageKey,
    },
    select: meta,
  });
  res.status(201).json(created);
});

filesRouter.get("/:id/download", async (req, res) => {
  const f = await prisma.userFile.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!f) throw new HttpError(404, "Document not found");
  const body = await readCv(f);
  res.attachment(f.filename);
  res.setHeader("Content-Type", f.mimeType);
  res.setHeader("Content-Length", String(body.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.end(body);
});

filesRouter.delete("/:id", async (req, res) => {
  const userId = uid(req);
  const f = await prisma.userFile.findFirst({ where: { id: req.params.id, userId }, select: { id: true, storageKey: true } });
  if (f) {
    await prisma.userFile.delete({ where: { id: f.id } });
    await deleteCvObject(f.storageKey);
    // Drop it from templates that listed it; scheduled emails skip a missing document at send time.
    const templates = await prisma.template.findMany({ where: { userId, attachFileIds: { has: f.id } }, select: { id: true, attachFileIds: true } });
    for (const t of templates) {
      await prisma.template.update({ where: { id: t.id }, data: { attachFileIds: t.attachFileIds.filter((x) => x !== f.id) } });
    }
  }
  res.status(204).end();
});
