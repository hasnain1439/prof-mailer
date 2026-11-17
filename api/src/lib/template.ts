export interface TemplateVars {
  name: string;
  university: string;
  researchFocus?: string | null;
  whyFits?: string | null;
}

export const PLACEHOLDERS = ["name", "university", "researchFocus", "whyFits"] as const;

/** Replace {{name}}, {{university}}, {{researchFocus}}, {{whyFits}} (whitespace inside braces allowed). */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(
    /\{\{\s*(name|university|researchFocus|whyFits)\s*\}\}/g,
    (_m, key: keyof TemplateVars) => {
      const v = vars[key];
      return v == null ? "" : String(v);
    },
  );
}

/** Placeholders present in text that are not supported. */
export function unknownPlaceholders(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]!);
  return [...new Set(found.filter((k) => !(PLACEHOLDERS as readonly string[]).includes(k)))];
}
