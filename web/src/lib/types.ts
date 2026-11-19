// Mirrors docs/API_CONTRACT.md exactly. All timestamps are ISO-8601 UTC strings.

export type ProfessorStatus = "NOT_SENT" | "SENT" | "REPLIED" | "INTERESTED" | "INTERVIEW" | "DECLINED";
export type ContactKind = "PROFESSOR" | "COMPANY";
export type EmailStatus = "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

export const PROFESSOR_STATUSES: ProfessorStatus[] = ["NOT_SENT", "SENT", "REPLIED", "INTERESTED", "INTERVIEW", "DECLINED"];
export const CONTACT_KINDS: ContactKind[] = ["PROFESSOR", "COMPANY"];
export const EMAIL_STATUSES: EmailStatus[] = ["SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED"];

/** A contact: a professor, or (kind COMPANY) a company where `university` holds the company name. */
export interface Professor {
  id: string;
  kind: ContactKind;
  name: string;
  email: string;
  university: string;
  country: string | null;
  researchFocus: string | null;
  whyFits: string | null;
  profileUrl: string | null;
  /** job title (companies) */
  role: string | null;
  /** job posting link (companies) */
  jobUrl: string | null;
  status: ProfessorStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessorListItem extends Professor {
  emailCount: number;
  lastSentAt: string | null;
  nextScheduledAt: string | null;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  isFollowUp: boolean;
  isHtml: boolean;
  attachCv: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Email {
  id: string;
  professorId: string;
  templateId: string | null;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  repliedAt: string | null;
  error: string | null;
  isHtml: boolean;
  attachCv: boolean;
  gmailThreadId: string | null;
  gmailMessageId: string | null;
  messageIdHeader: string | null;
  followUpNo: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailWithProfessor extends Email {
  professor: { id: string; name: string; email: string; university: string; status: ProfessorStatus; kind?: ContactKind; role?: string | null };
}

export type ProfessorWithEmails = Professor & { emails: Email[] };

export interface SettingsResponse {
  followUpAfterDays: number;
  maxFollowUps: number;
  dailySendLimit: number;
  followUpTemplateId: string | null;
  companyFollowUpTemplateId: string | null;
  dryRun: boolean;
  testRecipientSet: boolean;
  timezone: "Asia/Karachi";
  sentToday: number;
}

export interface SettingsInput {
  followUpAfterDays: number;
  maxFollowUps: number;
  dailySendLimit: number;
  followUpTemplateId: string | null;
  companyFollowUpTemplateId: string | null;
}

export interface ProfessorInput {
  kind?: ContactKind;
  name: string;
  email: string;
  university: string;
  country?: string | null;
  researchFocus?: string | null;
  whyFits?: string | null;
  profileUrl?: string | null;
  role?: string | null;
  jobUrl?: string | null;
  status?: ProfessorStatus;
  notes?: string | null;
}

export interface TemplateInput {
  name: string;
  subject: string;
  body: string;
  isFollowUp?: boolean;
  isHtml?: boolean;
  attachCv?: boolean;
}

export interface ImportRowData {
  /** raw "type" column ("professor" / "company" / "") */
  type?: string;
  company?: string;
  role?: string;
  jobUrl?: string;
  name: string;
  email: string;
  university: string;
  country: string;
  researchFocus: string;
  whyFits: string;
  profileUrl: string;
  subject: string;
  body: string;
  scheduledAt: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  data: ImportRowData;
  scheduledAtUtc: string | null;
  subject: string;
  body: string;
  /** blocking: the row is skipped on import */
  errors: string[];
  /** non-blocking notes (e.g. professor already contacted); the row is still imported */
  warnings: string[];
  professorExists: boolean;
  isHtml: boolean;
  kind?: ContactKind;
  role?: string;
  jobUrl?: string;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  validCount: number;
  errorCount: number;
}

export interface ImportCommitResult {
  professorsCreated: number;
  professorsUpdated: number;
  emailsCreated: number;
}

export interface Dashboard {
  counts: { scheduled: number; sentToday: number; replied: number; failed: number };
  contacts?: { professors: number; companies: number };
  upcoming: EmailWithProfessor[];
  recentSent: EmailWithProfessor[];
  dryRun: boolean;
  dailySendLimit: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  emailVerified: boolean;
  blocked: boolean;
  blockedAt: string | null;
  isAdmin: boolean;
  gmailConnected: boolean;
  gmailEmail: string | null;
  professorCount: number;
  emailsSent: number;
  emailsScheduled: number;
  lastSentAt: string | null;
}

export interface AdminStats {
  users: number;
  verifiedUsers: number;
  blockedUsers: number;
  gmailConnected: number;
  emailsSentToday: number;
  emailsSentTotal: number;
  emailsScheduled: number;
}

export type GmailAuthType = "APP_PASSWORD";

export interface GmailStatus {
  connected: boolean;
  email: string | null;
  authType: GmailAuthType | null;
  dryRun: boolean;
}

export interface GmailAppPasswordResult {
  ok: true;
  email: string;
}

export interface GmailTestSendResult {
  ok: true;
  to: string;
  dryRun?: boolean;
  gmailThreadId?: string;
  messageIdHeader?: string;
}

export interface CvInfo {
  filename: string;
  mimeType: string;
  size: number;
  updatedAt: string;
}
