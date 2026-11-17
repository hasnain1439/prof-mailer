import { timingSafeEqual } from "node:crypto";
import type { RequestHandler, Request } from "express";
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
/**
 * Client IP for rate limits. Only the web proxy (Vercel / next dev) knows the real browser IP; it sends
 * x-pm-client-ip together with x-pm-proxy-secret = API_PROXY_SECRET. Without a valid secret the header is
 * ignored and req.ip is used (trust proxy = TRUST_PROXY_HOPS, i.e. the address that reached Render), so a
 * client-supplied X-Forwarded-For can never pick its own rate-limit bucket.
 */
export function clientIp(req: Request): string {
  const secret = env.API_PROXY_SECRET;
  const given = req.get("x-pm-proxy-secret");
  if (secret && given && safeEqual(given, secret)) {
    const ip = (req.get("x-pm-client-ip") ?? "").trim();
    if (/^[0-9a-fA-F:.]{2,45}$/.test(ip)) return ip;
  }
  return req.ip ?? "unknown";
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function rateLimit(opts: { capacity: number; refillPerMinute: number }): RequestHandler {
  const buckets = new Map<string, { tokens: number; at: number }>();
  let lastPrune = Date.now();
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastPrune > 10 * 60 * 1000) {
      for (const [k, b] of buckets) if (now - b.at > 60 * 60 * 1000) buckets.delete(k);
      lastPrune = now;
    }
    const key = clientIp(req);
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

/**
 * Fixed-window attempt counter keyed by an arbitrary string (e.g. a lowercased email address).
 * In memory, single instance. Used for per-account login failures and per-address system mail.
 */
export class AttemptCounter {
  private readonly map = new Map<string, { count: number; start: number }>();
  private lastPrune = Date.now();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private entry(key: string, now: number) {
    if (now - this.lastPrune > this.windowMs) {
      for (const [k, e] of this.map) if (now - e.start >= this.windowMs) this.map.delete(k);
      this.lastPrune = now;
    }
    const e = this.map.get(key);
    if (!e || now - e.start >= this.windowMs) return null;
    return e;
  }

  /** True when the key has used up its attempts in the current window. */
  isBlocked(key: string): boolean {
    const e = this.entry(key, Date.now());
    return e !== null && e.count >= this.max;
  }

  hit(key: string): void {
    const now = Date.now();
    const e = this.entry(key, now);
    if (e) e.count += 1;
    else this.map.set(key, { count: 1, start: now });
  }

  /** hit() and report whether the key was still under the limit before this hit. */
  tryHit(key: string): boolean {
    if (this.isBlocked(key)) return false;
    this.hit(key);
    return true;
  }

  reset(key: string): void {
    this.map.delete(key);
  }
}
