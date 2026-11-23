/** The sender's own details (Settings → Your profile), filled into {{myName}} etc. */
export interface SenderProfile {
  myName?: string | null;
  myTitle?: string | null;
  myEmail?: string | null;
  myPhone?: string | null;
  myLinkedIn?: string | null;
  myPortfolio?: string | null;
  myEducation?: string | null;
  mySummary?: string | null;
}

export const SENDER_KEYS = [
  "myName",
  "myTitle",
  "myEmail",
  "myPhone",
  "myLinkedIn",
  "myPortfolio",
  "myEducation",
  "mySummary",
] as const satisfies readonly (keyof SenderProfile)[];

export interface TemplateVars {
  name: string;
  university: string;
  role?: string | null;
  jobUrl?: string | null;
  researchFocus?: string | null;
  whyFits?: string | null;
  sender?: SenderProfile | null;
}

const CONTACT_KEYS = ["name", "university", "company", "role", "jobUrl", "researchFocus", "whyFits"] as const;
export const PLACEHOLDERS = [...CONTACT_KEYS, ...SENDER_KEYS] as const;
const PLACEHOLDER_RE = new RegExp(String.raw`\{\{\s*(${PLACEHOLDERS.join("|")})\s*\}\}`, "g");

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace {{name}}, {{university}} / {{company}}, {{role}}, {{jobUrl}}, {{researchFocus}}, {{whyFits}}
 * and the sender's {{myName}}, {{myTitle}}, ... (whitespace inside braces allowed).
 * With `html: true`, values are HTML-escaped so professor data can't break the markup.
 */
export function renderTemplate(text: string, vars: TemplateVars, opts: { html?: boolean } = {}): string {
  return text.replace(PLACEHOLDER_RE, (_m, key: string) => {
    const v = key.startsWith("my")
      ? vars.sender?.[key as keyof SenderProfile]
      : key === "company"
        ? vars.university
        : vars[key as Exclude<keyof TemplateVars, "sender">];
    const s = v == null ? "" : String(v);
    // In HTML, keep the line breaks of multi-line values such as {{mySummary}}.
    return opts.html ? escapeHtml(s).replace(/\r?\n/g, "<br>") : s;
  });
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
