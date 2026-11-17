import type { RequestHandler } from "express";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    /** Machine-readable error code returned as `code` (e.g. "EMAIL_NOT_VERIFIED"). */
    public code?: string,
  ) {
    super(message);
  }
}

/** Parse and replace req.body with a zod schema; 400 with issues on failure. */
export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) return next(new HttpError(400, "Validation failed", z.flattenError(r.error)));
    req.body = r.data;
    next();
  };
}

/** Parse a query object with zod; throws HttpError(400) on failure. */
export function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  const r = schema.safeParse(query);
  if (!r.success) throw new HttpError(400, "Invalid query", z.flattenError(r.error));
  return r.data;
}
