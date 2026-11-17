# prof-mailer REST contract

Base URL: `http://localhost:4000/api` (web reads it from `NEXT_PUBLIC_API_URL`).

## Conventions
- JSON in/out. Request bodies are validated with zod.
- Errors: `{ "error": string, "details"?: unknown }` with 400 validation, 404 not found, 409 conflict / invalid state, 503 not configured.
- **All timestamps in JSON are ISO-8601 UTC strings** (`2026-11-20T04:30:00.000Z`). The web UI formats every timestamp in `Asia/Karachi`. Inputs the user types as local time (the datetime pickers, and import `scheduledAt`) are Karachi wall-clock. The web converts picker values to UTC ISO before sending. Import CSV values are converted on the server.
- Ids are cuid strings (Settings/GmailAccount use id 1 and it is never exposed as a param).

## Types
```ts
type ProfessorStatus = "NOT_SENT" | "SENT" | "REPLIED" | "INTERESTED" | "DECLINED";
type EmailStatus = "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

interface Professor {
  id: string; name: string; email: string; university: string;
  country: string | null; researchFocus: string | null; whyFits: string | null;
  profileUrl: string | null; status: ProfessorStatus; notes: string | null;
  createdAt: string; updatedAt: string;
}
interface ProfessorListItem extends Professor {
  emailCount: number;              // all Email rows
  lastSentAt: string | null;       // max sentAt
  nextScheduledAt: string | null;  // min scheduledAt among SCHEDULED
}
interface Template {
  id: string; name: string; subject: string; body: string; isFollowUp: boolean;
  createdAt: string; updatedAt: string;
}
interface Email {
  id: string; professorId: string; templateId: string | null;
  subject: string; body: string; status: EmailStatus;
  scheduledAt: string; sentAt: string | null; repliedAt: string | null; error: string | null;
  gmailThreadId: string | null; gmailMessageId: string | null; messageIdHeader: string | null;
  followUpNo: number; parentId: string | null; createdAt: string; updatedAt: string;
}
interface EmailWithProfessor extends Email {
  professor: { id: string; name: string; email: string; university: string; status: ProfessorStatus };
}
interface SettingsResponse {
  followUpAfterDays: number; maxFollowUps: number; dailySendLimit: number;
  followUpTemplateId: string | null;
  dryRun: boolean; testRecipientSet: boolean; timezone: "Asia/Karachi";
  sentToday: number;              // SENT emails since start of today (Karachi)
}
```

## Professors (agent A)
| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/professors` | `?status=&country=&q=` (q searches name/email/university, case-insensitive) | `ProfessorListItem[]` ordered by createdAt desc |
| GET | `/professors/countries` | | `string[]` distinct non-null, sorted |
| GET | `/professors/:id` | | `Professor & { emails: Email[] }`, emails ordered by `scheduledAt` asc (the thread view) |
| POST | `/professors` | `{ name, email, university, country?, researchFocus?, whyFits?, profileUrl?, status?, notes? }` | 201 `Professor` (409 if email exists) |
| PATCH | `/professors/:id` | any subset of the POST fields | `Professor` |
| DELETE | `/professors/:id` | | 204 (cascades emails) |

Emails are normalised to lowercase and trimmed.

## Templates (agent A)
| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/templates` | `?isFollowUp=true\|false` | `Template[]` ordered by name |
| GET | `/templates/:id` | | `Template` |
| POST | `/templates` | `{ name, subject, body, isFollowUp? }` | 201 `Template`. 400 if unknown `{{placeholders}}` |
| PATCH | `/templates/:id` | subset | `Template` |
| DELETE | `/templates/:id` | | 204 |
| POST | `/templates/:id/preview` | `{ professorId }` | `{ subject, body }` rendered |

Placeholders: `{{name}} {{university}} {{researchFocus}} {{whyFits}}`. Use `renderTemplate` from `src/lib/template.ts`.

## Import (agent A)
CSV/XLSX columns (header row, case-insensitive): `name, email, university, country, researchFocus, whyFits, profileUrl, subject, body, scheduledAt`.
`scheduledAt` is Karachi local `YYYY-MM-DD HH:mm`. Use `parseKarachiLocal` from `src/lib/time.ts`. XLSX date cells must be handled too.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/import/sample.csv` | | `text/csv` attachment `prof-mailer-sample.csv` (3 example rows, with fictional `@example.edu` emails; one row with empty subject/body to show template use) |
| POST | `/import/preview` | multipart: `file` (.csv/.xlsx, max 5 MB), optional field `templateId` | `ImportPreview` |
| POST | `/import/commit` | `{ rows: ImportRowData[], templateId?: string }` | `{ professorsCreated, professorsUpdated, emailsCreated }` |

```ts
interface ImportRowData { name: string; email: string; university: string; country: string;
  researchFocus: string; whyFits: string; profileUrl: string; subject: string; body: string; scheduledAt: string; }
interface ImportPreviewRow {
  rowNumber: number;            // 1-based spreadsheet row (header = 1, first data row = 2)
  data: ImportRowData;          // raw trimmed strings ("" when missing)
  scheduledAtUtc: string | null;
  subject: string; body: string; // final rendered values (row values, or the template when empty)
  errors: string[];             // empty = valid
  professorExists: boolean;
}
interface ImportPreview { rows: ImportPreviewRow[]; validCount: number; errorCount: number; }
```
Validation: required name, email (valid), university, scheduledAt (valid Karachi datetime). Subject and body are required unless a `templateId` is given. Duplicate emails within a file are an error on the later row. A scheduledAt in the past is valid, and that row sends on the next scheduler tick. Commit re-validates server-side, imports only valid rows, and runs in one transaction. It upserts Professor by email (it updates the profile fields and does not touch status) and creates an Email with `status: SCHEDULED, followUpNo: 0, templateId`.

## Emails / queue (agent A)
| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/emails` | `?status=SCHEDULED,FAILED` (comma list) `&professorId=&limit=` (default 200) | `EmailWithProfessor[]`. SCHEDULED/SENDING are ordered by scheduledAt asc, others by `sentAt ?? updatedAt` desc |
| POST | `/emails/:id/cancel` | | `Email` (only SCHEDULED or FAILED, else 409) → CANCELLED |
| PATCH | `/emails/:id` | `{ scheduledAt: string /* ISO UTC */, subject?, body? }` | `Email`. Allowed for SCHEDULED, FAILED or CANCELLED. Sets status back to SCHEDULED and clears `error` |

## Settings (agent A)
| GET | `/settings` | | `SettingsResponse` |
|---|---|---|---|
| PUT | `/settings` | `{ followUpAfterDays: int 1..60, maxFollowUps: int 0..10, dailySendLimit: int 1..500, followUpTemplateId: string \| null }` | `SettingsResponse` |

Use `getSettings()` from `src/lib/settings.ts`. Use `startOfKarachiDay()` for `sentToday`.

## Dashboard (agent A)
`GET /dashboard` returns
```ts
{ counts: { scheduled: number; sentToday: number; replied: number /* professors with status REPLIED|INTERESTED|DECLINED */; failed: number },
  upcoming: EmailWithProfessor[];   // next 10 SCHEDULED by scheduledAt
  recentSent: EmailWithProfessor[]; // last 10 SENT by sentAt desc
  dryRun: boolean; dailySendLimit: number; }
```

## Gmail (agent B)
| Method | Path | Response |
|---|---|---|
| GET | `/gmail/status` | `{ configured: boolean /* client id+secret present */, connected: boolean, email: string \| null, dryRun: boolean, testRecipientSet: boolean }` |
| GET | `/gmail/connect` | 302 to the Google consent screen (offline access, `prompt=consent`, scopes gmail.send + gmail.readonly + openid email). 503 if not configured |
| GET | `/gmail/callback?code=&state=` | stores the refresh token in GmailAccount, then 302 to `${WEB_URL}/gmail?connected=1` (or `?error=...`) |
| POST | `/gmail/disconnect` | 204, deletes GmailAccount (best-effort token revoke) |
| POST | `/gmail/test-send` | Real send **only to TEST_RECIPIENT** (400 if unset, 409 if not connected). Body `{ subject?, body? }`. Response `{ ok: true, to: string, gmailThreadId, messageIdHeader }`. In DRY_RUN it logs instead and returns `{ ok: true, dryRun: true, to }` |

## Jobs (agent B). Manual triggers for the same code the cron runs
| POST | `/jobs/send-due` | `{ now?: ISO }` (`now` is honoured only when DRY_RUN) | `{ processed, sent, failed, skippedDueToLimit, remainingToday }` |
|---|---|---|---|
| POST | `/jobs/check-replies` | `{ now?: ISO }` (`now` is honoured only when DRY_RUN) | `{ threadsChecked, repliesFound, followUpsCreated, followUpsCancelled }` |

## Dev helpers (agent B, mounted only when DRY_RUN=true)
| POST | `/dev/simulate-reply` | `{ emailId: string, from?: string /* defaults to the professor email */, at?: ISO }` | `{ ok: true, threadId }`. Adds a fake inbound message to the dry-run thread store. The real detection still runs on the next `check-replies` |
|---|---|---|---|
