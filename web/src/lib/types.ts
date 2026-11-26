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
  /** Extra documents (UserFile ids) attached to emails from this template. */
  attachFileIds: string[];
  /** Default CC / BCC (comma-separated). */
  cc: string | null;
  bcc: string | null;
  /** Open-tracking pixel (HTML only). */
  trackOpens: boolean;
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
  attachFileIds: string[];
  cc: string | null;
  bcc: string | null;
  trackOpens: boolean;
  /** First time the tracking pixel loaded (approximate). */
  openedAt: string | null;
  openCount: number;
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
  attachFileIds?: string[];
  cc?: string | null;
  bcc?: string | null;
  trackOpens?: boolean;
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

export type CvSlot = "general" | "professor" | "company";

export interface CvInfo {
  /** null = general CV */
  kind?: ContactKind | null;
  filename: string;
  mimeType: string;
  size: number;
  updatedAt: string;
}

/** Detail page of a contact: /companies/:id for companies, /professors/:id otherwise. */
export function contactHref(p: { id: string; kind?: ContactKind }): string {
  return `${p.kind === "COMPANY" ? "/companies" : "/professors"}/${encodeURIComponent(p.id)}`;
}

/** Contact fields embedded in reminders and emails. */
export interface ContactSummary {
  id: string;
  name: string;
  email: string;
  university: string;
  status: ProfessorStatus;
  kind: ContactKind;
  role: string | null;
}

export interface Reminder {
  id: string;
  title: string;
  note: string | null;
  dueAt: string;
  doneAt: string | null;
  notifiedAt: string | null;
  contactId: string | null;
  contact: ContactSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderInput {
  title: string;
  note?: string | null;
  /** UTC ISO */
  dueAt: string;
  contactId?: string | null;
}

export interface AnalyticsBucket {
  key: string;
  label: string;
  sent: number;
  replied: number;
  /** percent, one decimal */
  replyRate: number;
}

export interface Analytics {
  totals: { sent: number; replied: number; replyRate: number; followUpsSent: number; avgReplyHours: number | null };
  byKind: AnalyticsBucket[];
  byTemplate: AnalyticsBucket[];
  byCountry: AnalyticsBucket[];
  byOrg: AnalyticsBucket[];
  /** 12 Karachi weeks (Monday start), oldest first */
  weekly: { weekStart: string; sent: number; replied: number }[];
}

export interface AiDraft {
  subject: string;
  body: string;
  whyFits: string;
}

/** App-wide notice from the admin (plain text). */
export interface AppNotice {
  enabled: boolean;
  title: string;
  body: string;
  updatedAt: string;
}

/** Settings → Your profile; filled into templates as {{myName}} etc. */
export interface SenderProfile {
  myName: string | null;
  myTitle: string | null;
  myEmail: string | null;
  myPhone: string | null;
  myLinkedIn: string | null;
  myPortfolio: string | null;
  myEducation: string | null;
  mySummary: string | null;
}

export interface CvList {
  /** Any CV (older clients) */
  cv: CvInfo | null;
  cvs: Record<CvSlot, CvInfo | null>;
}

/** CV that would be attached for a contact of this kind (own slot, else general). */
export function cvFor(list: CvList | undefined, kind: ContactKind): CvInfo | null | undefined {
  if (!list) return undefined;
  return (kind === "COMPANY" ? list.cvs.company : list.cvs.professor) ?? list.cvs.general;
}

/** An extra document (transcript, cover letter, ...) that can be attached besides the CV. */
export interface UserFile {
  id: string;
  label: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
