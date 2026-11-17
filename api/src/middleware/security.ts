import type { RequestHandler } from "express";
import { env } from "../lib/env.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isDevLocalOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (u.hostname === "localhost" || u.hostname === "127.0.0.1") && (u.protocol === "http:" || u.protocol === "https:");
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string): boolean {
  if (origin === env.PUBLIC_URL) return true;
  return !env.IS_PROD && isDevLocalOrigin(origin);
}

/**
 * CSRF defence for cookie-authenticated mutations (cookies are SameSite=Lax as well):
 * - a present Origin header must be PUBLIC_URL (or localhost in dev);
 * - a request body must be JSON (multipart only for the import upload). HTML forms cannot send JSON.
 * Mounted on /api, so req.path is relative to it. /jobs/* uses a bearer secret, not cookies.
 */
export const csrfGuard: RequestHandler = (req, res, next) => {
  if (!MUTATING.has(req.method)) return next();
  if (req.path.startsWith("/jobs/")) return next();
  const origin = req.get("origin");
  if (origin && !isAllowedOrigin(origin)) return void res.status(403).json({ error: "Cross-site request rejected" });
  const ct = (req.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ct) return next(); // no body, e.g. POST /auth/logout
  if (ct === "application/json") return next();
  if (ct === "multipart/form-data" && req.method === "POST" && req.path === "/import/preview") return next();
  res.status(415).json({ error: "Content-Type must be application/json" });
};

/** Simple in-memory token bucket per client IP (resets on restart; fine for a single instance). */
export function rateLimit(opts: { capacity: number; refillPerMinute: number }): RequestHandler {
  const buckets = new Map<string, { tokens: number; at: number }>();
  let lastPrune = Date.now();
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastPrune > 10 * 60 * 1000) {
      for (const [k, b] of buckets) if (now - b.at > 60 * 60 * 1000) buckets.delete(k);
      lastPrune = now;
    }
    const key = req.ip ?? "unknown";
    const b = buckets.get(key) ?? { tokens: opts.capacity, at: now };
    b.tokens = Math.min(opts.capacity, b.tokens + ((now - b.at) / 60_000) * opts.refillPerMinute);
    b.at = now;
    buckets.set(key, b);
    if (b.tokens < 1) {
      res.setHeader("Retry-After", String(Math.ceil((60 / opts.refillPerMinute) * (1 - b.tokens))));
      return void res.status(429).json({ error: "Too many requests, try again shortly" });
    }
    b.tokens -= 1;
    next();
  };
}
