import type {
  AuthUser,
  Dashboard,
  Email,
  EmailStatus,
  EmailWithProfessor,
  GmailAppPasswordResult,
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

/** Same-origin by default: Next.js rewrites /api/* to the Express API (see next.config.ts). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/+$/, "");

/** Fired on window whenever an API call answers 401; AuthProvider listens and sends the user to /login. */
export const UNAUTHORIZED_EVENT = "pm:unauthorized";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
    /** Machine-readable error code from the API body (e.g. "EMAIL_NOT_VERIFIED"). */
    public code?: string,
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
  /** Don't broadcast a 401 (used by the auth calls themselves). */
  allowUnauthorized?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  // API_URL may be relative ("/api"), so resolve it against the page origin.
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(API_URL + path, base);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, headers, cache: "no-store", credentials: "include" };
  if (opts.form) {
    // multipart: the browser sets Content-Type with the boundary
    init.body = opts.form;
  } else if (method !== "GET") {
    // The API rejects mutations without a JSON content type (CSRF guard), even when there is no body.
    headers["Content-Type"] = "application/json";
    if (opts.json !== undefined) init.body = JSON.stringify(opts.json);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(`Could not reach the API at ${API_URL}. Is it running?`, 0);
  }

  if (res.status === 401 && !opts.allowUnauthorized && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
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
    const body = (data && typeof data === "object" ? data : {}) as { error?: unknown; details?: unknown; code?: unknown };
    const base = typeof body.error === "string" ? body.error : `Request failed (${res.status} ${res.statusText})`;
    const extra = describeDetails(body.details);
    throw new ApiError(extra ? `${base}: ${extra}` : base, res.status, body.details, typeof body.code === "string" ? body.code : undefined);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export const api = {
  // Auth
  me: () => request<{ user: AuthUser }>("/auth/me", { allowUnauthorized: true }),
  logout: () => request<void>("/auth/logout", { method: "POST", allowUnauthorized: true }),
  devLogin: (body: { email: string; name?: string }) =>
    request<{ user: AuthUser }>("/auth/dev-login", { method: "POST", json: body, allowUnauthorized: true }),
  signup: (body: { email: string }) =>
    request<{ ok: true }>("/auth/signup", { method: "POST", json: body, allowUnauthorized: true }),
  login: (body: { email: string; password: string }) =>
    request<{ user: AuthUser }>("/auth/login", { method: "POST", json: body, allowUnauthorized: true }),
  verifyEmail: (token: string, name: string, password: string) =>
    request<{ ok: true }>("/auth/verify-email", { method: "POST", json: { token, name, password }, allowUnauthorized: true }),
  checkVerifyToken: (token: string) =>
    request<{ valid: boolean }>("/auth/verify-email/check", { query: { token }, allowUnauthorized: true }),
  resendVerification: (email: string) =>
    request<{ ok: true }>("/auth/resend-verification", { method: "POST", json: { email }, allowUnauthorized: true }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>("/auth/forgot-password", { method: "POST", json: { email }, allowUnauthorized: true }),
  resetPassword: (body: { token: string; password: string }) =>
    request<{ ok: true }>("/auth/reset-password", { method: "POST", json: body, allowUnauthorized: true }),

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
  connectAppPassword: (body: { email: string; appPassword: string }) =>
    request<GmailAppPasswordResult>("/gmail/app-password", { method: "POST", json: body }),
  gmailDisconnect: () => request<void>("/gmail/disconnect", { method: "POST" }),
  gmailTestSend: (body: { subject?: string; body?: string } = {}) =>
    request<GmailTestSendResult>("/gmail/test-send", { method: "POST", json: body }),
};
