import type {
  Dashboard,
  Email,
  EmailStatus,
  EmailWithProfessor,
  GmailStatus,
  GmailTestSendResult,
  ImportCommitResult,
  ImportPreview,
  ImportRowData,
  Professor,
  ProfessorInput,
  ProfessorListItem,
  ProfessorStatus,
  ProfessorWithEmails,
  SettingsInput,
  SettingsResponse,
  Template,
  TemplateInput,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Turn the API's `details` (often zod's flattenError output) into readable text. */
function describeDetails(details: unknown): string {
  if (details == null) return "";
  if (typeof details === "string") return details;
  if (Array.isArray(details)) return details.map((d) => describeDetails(d)).filter(Boolean).join("; ");
  if (typeof details === "object") {
    const d = details as { formErrors?: unknown; fieldErrors?: unknown; message?: unknown };
    if (Array.isArray(d.formErrors) || (d.fieldErrors && typeof d.fieldErrors === "object")) {
      const out: string[] = [];
      if (Array.isArray(d.formErrors)) out.push(...d.formErrors.map(String));
      if (d.fieldErrors && typeof d.fieldErrors === "object") {
        for (const [field, msgs] of Object.entries(d.fieldErrors as Record<string, unknown>)) {
          out.push(`${field}: ${Array.isArray(msgs) ? msgs.join(", ") : String(msgs)}`);
        }
      }
      return out.join("; ");
    }
    if (typeof d.message === "string") return d.message;
    try {
      const s = JSON.stringify(details);
      return s.length > 300 ? s.slice(0, 300) + "…" : s;
    } catch {
      return "";
    }
  }
  return String(details);
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  json?: unknown;
  form?: FormData;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const init: RequestInit = { method: opts.method ?? "GET", headers: { Accept: "application/json" }, cache: "no-store" };
  if (opts.json !== undefined) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.json);
  } else if (opts.form) {
    init.body = opts.form;
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(`Could not reach the API at ${API_URL}. Is it running?`, 0);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const body = (data && typeof data === "object" ? data : {}) as { error?: unknown; details?: unknown };
    const base = typeof body.error === "string" ? body.error : `Request failed (${res.status} ${res.statusText})`;
    const extra = describeDetails(body.details);
    throw new ApiError(extra ? `${base}: ${extra}` : base, res.status, body.details);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export const api = {
  // Dashboard
  dashboard: () => request<Dashboard>("/dashboard"),

  // Professors
  listProfessors: (q: { status?: ProfessorStatus | ""; country?: string; q?: string } = {}) =>
    request<ProfessorListItem[]>("/professors", { query: q }),
  countries: () => request<string[]>("/professors/countries"),
  getProfessor: (id: string) => request<ProfessorWithEmails>(`/professors/${encodeURIComponent(id)}`),
  createProfessor: (body: ProfessorInput) => request<Professor>("/professors", { method: "POST", json: body }),
  updateProfessor: (id: string, body: Partial<ProfessorInput>) =>
    request<Professor>(`/professors/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),
  deleteProfessor: (id: string) => request<void>(`/professors/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Templates
  listTemplates: (isFollowUp?: boolean) =>
    request<Template[]>("/templates", { query: { isFollowUp: isFollowUp === undefined ? undefined : String(isFollowUp) } }),
  getTemplate: (id: string) => request<Template>(`/templates/${encodeURIComponent(id)}`),
  createTemplate: (body: TemplateInput) => request<Template>("/templates", { method: "POST", json: body }),
  updateTemplate: (id: string, body: Partial<TemplateInput>) =>
    request<Template>(`/templates/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),
  deleteTemplate: (id: string) => request<void>(`/templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
  previewTemplate: (id: string, professorId: string) =>
    request<{ subject: string; body: string; isHtml: boolean }>(`/templates/${encodeURIComponent(id)}/preview`, {
      method: "POST",
      json: { professorId },
    }),

  // Import
  sampleCsvUrl: `${API_URL}/import/sample.csv`,
  importPreview: (file: File, templateId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (templateId) form.append("templateId", templateId);
    return request<ImportPreview>("/import/preview", { method: "POST", form });
  },
  importCommit: (rows: ImportRowData[], templateId?: string) =>
    request<ImportCommitResult>("/import/commit", {
      method: "POST",
      json: templateId ? { rows, templateId } : { rows },
    }),

  // Emails
  listEmails: (q: { status?: EmailStatus[]; professorId?: string; limit?: number } = {}) =>
    request<EmailWithProfessor[]>("/emails", {
      query: { status: q.status?.join(","), professorId: q.professorId, limit: q.limit },
    }),
  cancelEmail: (id: string) => request<Email>(`/emails/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  updateEmail: (id: string, body: { scheduledAt: string; subject?: string; body?: string }) =>
    request<Email>(`/emails/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),

  // Settings
  getSettings: () => request<SettingsResponse>("/settings"),
  putSettings: (body: SettingsInput) => request<SettingsResponse>("/settings", { method: "PUT", json: body }),

  // Gmail
  gmailStatus: () => request<GmailStatus>("/gmail/status"),
  gmailConnectUrl: `${API_URL}/gmail/connect`,
  gmailDisconnect: () => request<void>("/gmail/disconnect", { method: "POST" }),
  gmailTestSend: (body: { subject?: string; body?: string } = {}) =>
    request<GmailTestSendResult>("/gmail/test-send", { method: "POST", json: body }),
};
