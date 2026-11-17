/**
 * Asia/Karachi is a fixed UTC+05:00 offset (no DST). All DB values are UTC.
 */
export const APP_TIMEZONE = "Asia/Karachi";
const OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Parse a Karachi wall-clock string into a UTC Date.
 * Accepts "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm", optional ":ss". Returns null when invalid.
 */
export function parseKarachiLocal(input: string): Date | null {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(input);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x))) as [
    number, number, number, number, number, number,
  ];
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - OFFSET_MS;
  const k = new Date(utcMs + OFFSET_MS);
  // Reject overflow such as 2026-02-31 or 25:00.
  if (
    k.getUTCFullYear() !== y ||
    k.getUTCMonth() !== mo - 1 ||
    k.getUTCDate() !== d ||
    k.getUTCHours() !== h ||
    k.getUTCMinutes() !== mi
  ) {
    return null;
  }
  return new Date(utcMs);
}

/** Format a UTC Date as Karachi wall-clock "YYYY-MM-DD HH:mm". */
export function formatKarachi(date: Date): string {
  const k = new Date(date.getTime() + OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

/** UTC instant at which the current Karachi calendar day started. */
export function startOfKarachiDay(now: Date = new Date()): Date {
  const k = new Date(now.getTime() + OFFSET_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - OFFSET_MS);
}
