/** Pure helpers for the jobs (no env / prisma imports, unit-testable). */

/** "Re: " + subject, without doubling an existing "Re:" prefix. */
export function followUpSubject(rootSubject: string): string {
  const s = rootSubject.trim();
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/** Random integer delay in [min, max] ms; tolerates swapped / negative / non-finite bounds. */
export function randomDelayMs(min: number, max: number, rnd: () => number = Math.random): number {
  let lo = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
  let hi = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : lo;
  if (hi < lo) [lo, hi] = [hi, lo];
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

export function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/** Error message safe to store / log: no bearer tokens, truncated to `max` chars. */
export function safeErrorMessage(err: unknown, max = 500): string {
  let msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  msg = msg
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/1\/\/[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/(access_token|refresh_token|id_token|client_secret|code)=([^&\s]+)/gi, "$1=[redacted]");
  return msg.length > max ? msg.slice(0, max) : msg;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
