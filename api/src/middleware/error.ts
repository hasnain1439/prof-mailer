import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { HttpError } from "../lib/http.js";

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return void res.status(404).json({ error: "Record not found" });
    if (err.code === "P2002") return void res.status(409).json({ error: "Duplicate value", details: err.meta });
  }
  // Malformed JSON: V8's SyntaxError message quotes part of the body (could be a password), so never echo/log it.
  if (err?.type === "entity.parse.failed") return void res.status(400).json({ error: "Invalid JSON body" });
  // Log message + stack only; never log request bodies, tokens or env.
  console.error(err instanceof Error ? err.stack : err);
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: status === 500 ? "Internal server error" : String(err.message) });
};
