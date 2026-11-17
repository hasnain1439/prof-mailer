import { z } from "zod";
import { formatKarachi, parseKarachiLocal } from "../../lib/time.js";
import { renderTemplate, unknownPlaceholders, type TemplateVars } from "../../lib/template.js";
import type { ImportRowData, ParsedRow } from "./parse.js";

/** Pure import-row validation (no DB). */

export interface ImportPreviewRow {
  rowNumber: number;
  data: ImportRowData;
  scheduledAtUtc: string | null;
  subject: string;
  body: string;
  /** true when the body came from an HTML template */
  isHtml: boolean;
  /** blocking: the row is skipped on commit */
  errors: string[];
  /** non-blocking: the row is imported, but the user should know */
  warnings: string[];
  professorExists: boolean;
}

/** What the DB already knows about a professor in the file (keyed by lowercase email). */
export interface ExistingProfessorInfo {
  status: string;
  /** has a SCHEDULED or SENDING email */
  hasPendingEmail: boolean;
  /** sentAt of the earliest SENT first email (followUpNo 0), or null */
  firstSentAt: Date | null;
}

const STOP_STATUSES = new Set(["REPLIED", "INTERESTED", "DECLINED"]);

/** Re-import rules for an existing professor: errors block the row, warnings don't. */
function existingProfessorChecks(info: ExistingProfessorInfo | undefined, errors: string[], warnings: string[]): void {
  if (!info) return;
  if (STOP_STATUSES.has(info.status)) {
    const what = info.status === "REPLIED" ? "already replied" : `already marked ${info.status}`;
    errors.push(`Professor ${what}; not scheduling another first email`);
  }
  if (info.hasPendingEmail) errors.push("Already has a scheduled email");
  if (info.firstSentAt && errors.length === 0) {
    warnings.push(
      `Already contacted on ${formatKarachi(info.firstSentAt)} PKT; this schedules another first email`,
    );
  }
}

export interface ImportTemplate {
  subject: string;
  body: string;
  isHtml: boolean;
}

const emailSchema = z.email();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validate rows and render final subject/body.
 * @param template the selected template (null when none was given)
 * @param existing professors already in the DB, keyed by lowercase email
 */
export function validateImportRows(
  rows: ParsedRow[],
  template: ImportTemplate | null,
  existing: ReadonlyMap<string, ExistingProfessorInfo>,
): ImportPreviewRow[] {
  const seen = new Map<string, number>(); // email → first rowNumber

  return rows.map(({ rowNumber, data }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!data.name) errors.push("name is required");
    if (!data.university) errors.push("university is required");

    const email = normalizeEmail(data.email);
    if (!email) errors.push("email is required");
    else if (!emailSchema.safeParse(email).success) errors.push(`email "${data.email}" is not a valid email address`);
    else {
      const first = seen.get(email);
      if (first !== undefined) errors.push(`duplicate email (already used on row ${first})`);
      else seen.set(email, rowNumber);
    }

    let scheduledAtUtc: string | null = null;
    if (!data.scheduledAt) errors.push("scheduledAt is required (YYYY-MM-DD HH:mm, Asia/Karachi)");
    else {
      const d = parseKarachiLocal(data.scheduledAt);
      if (!d) errors.push(`scheduledAt "${data.scheduledAt}" is not a valid date/time (use YYYY-MM-DD HH:mm, Asia/Karachi)`);
      else scheduledAtUtc = d.toISOString();
    }

    const rawSubject = data.subject || template?.subject || "";
    const rawBody = data.body || template?.body || "";
    const isHtml = !data.body && !!template?.isHtml;
    if (!rawSubject) errors.push(template ? "subject is empty (row and template)" : "subject is required (or choose a template)");
    if (!rawBody) errors.push(template ? "body is empty (row and template)" : "body is required (or choose a template)");

    const unknown = [...new Set([...unknownPlaceholders(rawSubject), ...unknownPlaceholders(rawBody)])];
    if (unknown.length) errors.push(`unknown placeholder(s): ${unknown.map((u) => `{{${u}}}`).join(", ")}`);

    existingProfessorChecks(email ? existing.get(email) : undefined, errors, warnings);

    const vars: TemplateVars = {
      name: data.name,
      university: data.university,
      researchFocus: data.researchFocus,
      whyFits: data.whyFits,
    };

    return {
      rowNumber,
      data,
      scheduledAtUtc,
      subject: renderTemplate(rawSubject, vars),
      body: renderTemplate(rawBody, vars, { html: isHtml }),
      isHtml,
      errors,
      warnings,
      professorExists: email !== "" && existing.has(email),
    };
  });
}
