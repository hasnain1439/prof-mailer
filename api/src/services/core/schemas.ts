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
