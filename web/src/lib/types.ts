// Mirrors docs/API_CONTRACT.md exactly. All timestamps are ISO-8601 UTC strings.

export type ProfessorStatus = "NOT_SENT" | "SENT" | "REPLIED" | "INTERESTED" | "DECLINED";
export type EmailStatus = "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

export const PROFESSOR_STATUSES: ProfessorStatus[] = ["NOT_SENT", "SENT", "REPLIED", "INTERESTED", "DECLINED"];
export const EMAIL_STATUSES: EmailStatus[] = ["SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED"];

export interface Professor {
  id: string;
  name: string;
  email: string;
  university: string;
  country: string | null;
  researchFocus: string | null;
  whyFits: string | null;
  profileUrl: string | null;
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
  gmailThreadId: string | null;
  gmailMessageId: string | null;
  messageIdHeader: string | null;
  followUpNo: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailWithProfessor extends Email {
  professor: { id: string; name: string; email: string; university: string; status: ProfessorStatus };
}

export type ProfessorWithEmails = Professor & { emails: Email[] };

export interface SettingsResponse {
  followUpAfterDays: number;
  maxFollowUps: number;
  dailySendLimit: number;
  followUpTemplateId: string | null;
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
}

export interface ProfessorInput {
  name: string;
  email: string;
  university: string;
  country?: string | null;
  researchFocus?: string | null;
  whyFits?: string | null;
  profileUrl?: string | null;
  status?: ProfessorStatus;
  notes?: string | null;
}

export interface TemplateInput {
  name: string;
  subject: string;
  body: string;
  isFollowUp?: boolean;
}

export interface ImportRowData {
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
  errors: string[];
  professorExists: boolean;
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
  upcoming: EmailWithProfessor[];
  recentSent: EmailWithProfessor[];
  dryRun: boolean;
  dailySendLimit: number;
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  dryRun: boolean;
  testRecipientSet: boolean;
}

export interface GmailTestSendResult {
  ok: true;
  to: string;
  dryRun?: boolean;
  gmailThreadId?: string;
  messageIdHeader?: string;
}
