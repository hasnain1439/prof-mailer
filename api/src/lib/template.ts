export interface TemplateVars {
  name: string;
  university: string;
  researchFocus?: string | null;
  whyFits?: string | null;
}

export const PLACEHOLDERS = ["name", "university", "researchFocus", "whyFits"] as const;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace {{name}}, {{university}}, {{researchFocus}}, {{whyFits}} (whitespace inside braces allowed).
 * With `html: true`, values are HTML-escaped so professor data can't break the markup.
 */
export function renderTemplate(text: string, vars: TemplateVars, opts: { html?: boolean } = {}): string {
  return text.replace(
    /\{\{\s*(name|university|researchFocus|whyFits)\s*\}\}/g,
    (_m, key: keyof TemplateVars) => {
      const v = vars[key];
      const s = v == null ? "" : String(v);
      return opts.html ? escapeHtml(s) : s;
    },
  );
}

/** Placeholders present in text that are not supported. */
export function unknownPlaceholders(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]!);
  return [...new Set(found.filter((k) => !(PLACEHOLDERS as readonly string[]).includes(k)))];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** Readable plain-text version of an HTML email (used as the text/plain alternative). */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
      const t = text.replace(/<[^>]+>/g, "").trim();
      return t && t !== href ? `${t} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  s = s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
