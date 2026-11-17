import type { CookieOptions, Request, Response } from "express";
import { env } from "./env.js";

/** Parse the Cookie header (no dependency). Malformed pairs are skipped. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    let value = part.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      // skip undecodable values
    }
  }
  return out;
}

export function getCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

export function baseCookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: env.COOKIE_SECURE, path: "/" };
}

export function setCookie(res: Response, name: string, value: string, maxAgeMs: number, path = "/"): void {
  res.cookie(name, value, { ...baseCookieOptions(), path, maxAge: maxAgeMs });
}

export function clearCookie(res: Response, name: string, path = "/"): void {
  res.clearCookie(name, { ...baseCookieOptions(), path });
}
