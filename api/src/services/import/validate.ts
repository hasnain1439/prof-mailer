import { z } from "zod";
import { parseKarachiLocal } from "../../lib/time.js";
import { renderTemplate, unknownPlaceholders, type TemplateVars } from "../../lib/template.js";
import type { ImportRowData, ParsedRow } from "./parse.js";

/** Pure import-row validation (no DB). */

export interface ImportPreviewRow {
  rowNumber: number;
  data: ImportRowData;
  scheduledAtUtc: string | null;
  subject: string;
  body: string;
  errors: string[];
  professorExists: boolean;
}

export interface ImportTemplate {
  subject: string;
  body: string;
}

const emailSchema = z.email();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validate rows and render final subject/body.
 * @param template the selected template (null when none was given)
 * @param existingEmails lowercase emails of professors already in the DB
 */
export function validateImportRows(
  rows: ParsedRow[],
  template: ImportTemplate | null,
  existingEmails: ReadonlySet<string>,
): ImportPreviewRow[] {
  const seen = new Map<string, number>(); // email → first rowNumber

  return rows.map(({ rowNumber, data }) => {
    const errors: string[] = [];
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
    if (!rawSubject) errors.push(template ? "subject is empty (row and template)" : "subject is required (or choose a template)");
    if (!rawBody) errors.push(template ? "body is empty (row and template)" : "body is required (or choose a template)");

    const unknown = [...new Set([...unknownPlaceholders(rawSubject), ...unknownPlaceholders(rawBody)])];
    if (unknown.length) errors.push(`unknown placeholder(s): ${unknown.map((u) => `{{${u}}}`).join(", ")}`);

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
      body: renderTemplate(rawBody, vars),
      errors,
      professorExists: email !== "" && existingEmails.has(email),
    };
  });
}
