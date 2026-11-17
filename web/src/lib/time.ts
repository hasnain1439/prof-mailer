// All API timestamps are UTC ISO strings. The UI always shows and accepts
// Asia/Karachi wall-clock time (PKT, fixed UTC+5, no DST). Never use the
// browser's local timezone.

export const KARACHI_TZ = "Asia/Karachi";
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: KARACHI_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "20 Nov 2026, 09:30 PKT"; "—" for null/invalid. */
export function formatKarachi(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = Object.fromEntries(formatter.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} PKT`;
}

/** "YYYY-MM-DDTHH:mm" (Karachi wall clock, e.g. from datetime-local) -> UTC ISO. Throws if invalid. */
export function karachiInputToUtcIso(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid date/time: "${value}"`);
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  // Date.UTC would silently roll 10:61 over to 11:01; reject out-of-range clock fields instead.
  if (h > 23 || mi > 59 || s > 59) throw new Error(`Invalid time: "${value}"`);
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - KARACHI_OFFSET_MS;
  const check = new Date(ms + KARACHI_OFFSET_MS);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error(`Invalid date: "${value}"`);
  }
  return new Date(ms).toISOString();
}

/** UTC ISO -> "YYYY-MM-DDTHH:mm" in Karachi wall clock, for prefilling datetime-local. */
export function utcIsoToKarachiInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + KARACHI_OFFSET_MS).toISOString().slice(0, 16);
}

/** Now (+ optional minutes) as a Karachi datetime-local value. */
export function karachiInputFromNow(addMinutes = 0): string {
  return utcIsoToKarachiInput(new Date(Date.now() + addMinutes * 60_000).toISOString());
}
