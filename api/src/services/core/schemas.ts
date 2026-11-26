import { z } from "zod";

export const PROFESSOR_STATUSES = ["NOT_SENT", "SENT", "REPLIED", "INTERESTED", "INTERVIEW", "DECLINED"] as const;
export const CONTACT_KINDS = ["PROFESSOR", "COMPANY"] as const;
export const EMAIL_STATUSES = ["SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED"] as const;

/** Trimmed non-empty string. */
export const reqStr = z.string().trim().min(1, "Required");

/** Optional nullable text: trims; "" becomes null. */
export const optStr = z
  .string()
  .nullish()
  .transform((v) => {
    if (v == null) return v; // keep undefined (not provided) vs null (cleared)
    const t = v.trim();
    return t === "" ? null : t;
  });

export const emailStr = z.string().trim().toLowerCase().pipe(z.email("Invalid email"));

/** Select used for EmailWithProfessor. */
export const professorSummarySelect = {
  id: true,
  name: true,
  email: true,
  university: true,
  status: true,
  kind: true,
  role: true,
} as const;

export const MAX_COPY_ADDRESSES = 10;

/** Split a CC/BCC cell ("a@x.com, b@y.com" or ; / spaces) into lowercased addresses. */
export function splitAddresses(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

const SIMPLE_EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Problem with a CC/BCC list, or null when it is fine (empty is fine). */
export function addressListError(raw: string | null | undefined): string | null {
  const list = splitAddresses(raw);
  if (list.length > MAX_COPY_ADDRESSES) return `at most ${MAX_COPY_ADDRESSES} addresses`;
  const bad = list.filter((a) => !SIMPLE_EMAIL.test(a));
  return bad.length ? `invalid address(es): ${bad.join(", ")}` : null;
}

/** Normalised "a@x.com, b@y.com", or null when empty. */
export function joinAddresses(raw: string | null | undefined): string | null {
  const list = [...new Set(splitAddresses(raw))];
  return list.length ? list.join(", ") : null;
}

/** Optional CC/BCC field: validated and normalised; "" / null clears it. */
export const addressListField = z
  .string()
  .max(1000)
  .nullish()
  .superRefine((v, ctx) => {
    const err = addressListError(v);
    if (err) ctx.addIssue({ code: "custom", message: err });
  })
  .transform((v) => (v === undefined ? undefined : joinAddresses(v)));

/** Ids of the user's extra documents (UserFile) to attach. */
export const fileIdsField = z.array(z.string().min(1)).max(5);
