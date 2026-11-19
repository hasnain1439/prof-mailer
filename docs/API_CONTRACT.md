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
  isHtml: boolean;                 // body is HTML (sent as multipart/alternative with auto text part)
  createdAt: string; updatedAt: string;
}
interface Email {
  id: string; professorId: string; templateId: string | null;
  subject: string; body: string; isHtml: boolean; status: EmailStatus;
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
| POST | `/templates` | `{ name, subject, body, isFollowUp?, isHtml? }` | 201 `Template`. 400 if unknown `{{placeholders}}` |
| PATCH | `/templates/:id` | subset | `Template` |
| DELETE | `/templates/:id` | | 204 |
| POST | `/templates/:id/preview` | `{ professorId }` | `{ subject, body, isHtml }` rendered (values HTML-escaped when isHtml) |

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
  isHtml: boolean;              // true when body came from an HTML template
  errors: string[];             // empty = valid (rows with errors are skipped on commit)
  warnings: string[];           // non-blocking notes; the row is still imported (see "Import re-validation (v2.1)")
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
| PUT | `/settings` | `{ followUpAfterDays: int 1..60, maxFollowUps: int 0..10, dailySendLimit: int >= 1 (capped to 50), followUpTemplateId: string \| null }` | `SettingsResponse` |

Use `getSettings()` from `src/lib/settings.ts`. `sentToday` counts SENT emails with sentAt in [`startOfKarachiDay()`, +24h).

## Dashboard (agent A)
`GET /dashboard` returns
```ts
{ counts: { scheduled: number; sentToday: number; replied: number /* professors with status REPLIED|INTERESTED|DECLINED */; failed: number },
  upcoming: EmailWithProfessor[];   // next 10 SCHEDULED by scheduledAt
  recentSent: EmailWithProfessor[]; // last 10 SENT by sentAt desc
  dryRun: boolean; dailySendLimit: number; }
```

## Gmail (agent B)
Two ways to connect the single Gmail account (GmailAccount id=1); connecting with one replaces the other.
- **APP_PASSWORD** (easiest): Gmail address + Google App Password. Sends over SMTP (smtp.gmail.com:465), reads Sent / All Mail over IMAP (imap.gmail.com:993). The password is stored AES-256-GCM encrypted (key: `ENCRYPTION_KEY` env, else auto-generated `api/.data/secret.key`) and is never returned or logged. `gmailThreadId` is Gmail's X-GM-THRID (decimal string) or, if Gmail had not indexed the sent message yet, `smtp-<Message-ID>` (replies are then matched via In-Reply-To / References).
- **OAUTH**: Google Cloud OAuth client (`/gmail/connect`). `gmailThreadId` is the Gmail API (hex) thread id. Both spellings are accepted by either mode, so switching modes keeps reply detection working.

| Method | Path | Response |
|---|---|---|
| GET | `/gmail/status` | `{ oauthConfigured: boolean /* GOOGLE_CLIENT_ID+SECRET present */, configured: boolean /* deprecated alias of oauthConfigured */, connected: boolean, email: string \| null, authType: "OAUTH" \| "APP_PASSWORD" \| null, dryRun: boolean, testRecipientSet: boolean }` |
| POST | `/gmail/app-password` | Body `{ email: string, appPassword: string }`. Whitespace/dashes in the password are stripped; it must then be 16 letters (else 400). Verifies the SMTP **and** IMAP login (~15 s timeouts) before saving; sends nothing (works in DRY_RUN). 200 `{ ok: true, email }`. 400 `{ error }` for a bad address/password format, or when Gmail rejects the login (`"Gmail rejected the login. Make sure 2-Step Verification is on and you used an App Password, not your normal password."`). 502 `{ error }` when Gmail can't be reached or IMAP is disabled |
| GET | `/gmail/connect` | 302 to the Google consent screen (offline access, `prompt=consent`, scopes gmail.send + gmail.readonly + openid email). 503 if not configured |
| GET | `/gmail/callback?code=&state=` | stores the refresh token in GmailAccount, then 302 to `${WEB_URL}/gmail?connected=1` (or `?error=...`) |
| POST | `/gmail/disconnect` | 204, deletes GmailAccount of either type (best-effort token revoke for OAUTH; nothing to revoke for APP_PASSWORD) |
| POST | `/gmail/test-send` | Real send **only to TEST_RECIPIENT** (400 if unset, 409 if not connected). Body `{ subject?, body? }`. Response `{ ok: true, to: string, gmailThreadId, messageIdHeader }`. In DRY_RUN it logs instead and returns `{ ok: true, dryRun: true, to }` |

## Jobs (agent B). Manual triggers for the same code the cron runs
| POST | `/jobs/send-due` | `{ now?: ISO }` (`now` is honoured only when DRY_RUN) | `{ processed, sent, failed, skippedDueToLimit, remainingToday }` |
|---|---|---|---|
| POST | `/jobs/check-replies` | `{ now?: ISO }` (`now` is honoured only when DRY_RUN) | `{ threadsChecked, repliesFound, followUpsCreated, followUpsCancelled }` |

## Dev helpers (agent B, mounted only when DRY_RUN=true)
| POST | `/dev/simulate-reply` | `{ emailId: string, from?: string /* defaults to the professor email */, at?: ISO }` | `{ ok: true, threadId }`. Adds a fake inbound message to the dry-run thread store. The real detection still runs on the next `check-replies` |
|---|---|---|---|

---

# Multi-user (v2): Google sign-in, per-user data, Gmail API

Deployment shape: web on Vercel; Express API on Render (free); Neon DB; cron-job.org pings the API.
The browser only talks to the web origin: Next.js rewrites `/api/:path*` → `${API_ORIGIN}/api/:path*`
(prod: the Render URL; local: http://localhost:4100). So cookies are first-party on the web origin, and
`NEXT_PUBLIC_API_URL` defaults to `/api`.

## Auth (all public)
| Method | Path | Notes |
|---|---|---|
| GET | `/auth/google` | 302 to Google (scopes `openid email profile`, `state` in a short-lived httpOnly cookie). Optional `?next=/path` (relative only). |
| GET | `/auth/google/callback` | Verifies state + id_token, upserts User by Google `sub`, creates a Session, sets `pm_session` cookie (httpOnly, SameSite=Lax, Secure in prod, 30 days), 302 to `${PUBLIC_URL}${next or "/"}`. On error, 302 `${PUBLIC_URL}/login?error=...`. |
| GET | `/auth/me` | `{ user: { id, email, name, picture } }` or 401 `{ error: "Not signed in" }` |
| POST | `/auth/logout` | 204, deletes the session and clears the cookie |
| POST | `/auth/dev-login` | **Only when DEV_LOGIN_ENABLED=true AND NODE_ENV!=="production"** (else 404). `{ email, name? }` → creates/gets a user and signs in. For local QA without Google. |

Every other `/api/*` route (except `/health` and `/auth/*`) requires a session: 401 `{ error: "Not signed in" }` otherwise.
Everything is scoped to the signed-in user: professors, templates, emails, settings, Gmail account, import, dashboard.
Accessing another user's id returns 404.

## Gmail (per user)
- `GET /gmail/connect`: 302 to Google with scopes `gmail.send gmail.readonly` (+ `openid email`), `access_type=offline`, `prompt=consent`, `login_hint=<user email>`, `include_granted_scopes=true`. Redirect URI `${PUBLIC_URL}/api/gmail/callback`.
- `GET /gmail/callback`: stores the token on the user's GmailAccount, then 302 `${PUBLIC_URL}/gmail?connected=1`.
- `GET /gmail/status`: same shape as before; `appPasswordEnabled: boolean` added (false unless env `APP_PASSWORD_ENABLED=true`, because Render free blocks SMTP).
- `POST /gmail/test-send`: sends only to **the signed-in user's own email** (their Google address). DRY_RUN logs instead.

## Jobs (cron)
- `POST|GET /jobs/tick`: requires header `Authorization: Bearer ${CRON_SECRET}` (401 otherwise). Runs send-due, plus check-replies if the last check was ≥ 60 min ago. Returns `{ sendDue, checkReplies | null }`.
- `POST /jobs/send-due`, `POST /jobs/check-replies`: same CRON_SECRET auth (no longer user-callable). `{ now? }` only in DRY_RUN.
- `GET /health`: public, used by cron-job.org to keep the Render instance awake.
- `/dev/simulate-reply`: DRY_RUN only, requires a session, and the email must belong to that user.

## Sending rules (per user)
- Each user has their own Settings row (defaults 3 / 2 / 20). `dailySendLimit` is capped at 50 server-side.
- Spacing: at most one send per user per scheduler tick, and only if ≥ a random 30–120 s has passed since that user's last send (no long sleeps inside a request).
- The daily limit uses the Karachi day, as before.

## Import re-validation and send safety (v2.1)
`ImportPreviewRow.warnings: string[]` (non-blocking; the row is still imported). For a professor that already exists for this user:
- status REPLIED / INTERESTED / DECLINED → **error** `Professor already replied; not scheduling another first email` (or `Professor already marked INTERESTED|DECLINED; …`).
- has a SCHEDULED or SENDING email → **error** `Already has a scheduled email`.
- otherwise, if a first email (followUpNo 0) was already SENT → **warning** `Already contacted on <YYYY-MM-DD HH:mm, Karachi>; this schedules another first email`.

Commit re-validates the same way inside its transaction; rows with errors are skipped.

- Send-due cancels due **first emails as well as follow-ups** whose professor is REPLIED / INTERESTED / DECLINED: status CANCELLED, `error: "Professor already replied"`.
- Daily limit and `sentToday` count SENT emails with sentAt in [start of the Karachi day, +24h).
- `PUT /settings`: `dailySendLimit` accepts any positive integer and is capped to 50.
- Gmail OAuth `refreshToken` / `accessToken` are stored encrypted (AES-256-GCM, same key as the app password); legacy plaintext is read as-is and re-encrypted on the next write.
- In-process scheduler: check-replies is polled every 10 min and runs only when ≥ 60 min have passed since `lastReplyCheckAt` (shared with `/jobs/tick`). Expired sessions are pruned hourly.

---

# v3: Email + password accounts, Gmail App Password only (supersedes Google sign-in and Gmail OAuth)

Google sign-in and Gmail OAuth are removed. Users sign up with email + password and verify their email.
Each user then connects the Gmail account they send from with a Gmail **App Password** (SMTP smtp.gmail.com:465 for
sending, IMAP imap.gmail.com:993 for reply checks).

System mail (verification / password reset) is sent through the app owner's SMTP account from env:
`SMTP_HOST, SMTP_PORT (default 465), SMTP_SECURE (default true when port 465), SMTP_USER, SMTP_PASS, MAIL_FROM`
(e.g. `prof-mailer <no-reply@example.org>`). If SMTP is not configured and NODE_ENV !== "production",
the API logs the link to the console instead of sending (dev only). In production a missing SMTP config fails at startup.

## Auth (public, rate limited)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/signup` | `{ name, email, password }` (password ≥ 8 chars) | 201 `{ ok: true }`. Sends a verification email. Duplicate email → 201 too (no account enumeration; an existing verified user gets a "someone tried to sign up" note, or nothing). |
| POST | `/auth/verify-email` | `{ token }` | 200 `{ ok: true }`. Marks the email verified and signs the user in (sets `pm_session`). 400 if invalid or expired (24 h). |
| POST | `/auth/resend-verification` | `{ email }` | 200 `{ ok: true }` always. |
| POST | `/auth/login` | `{ email, password }` | 200 `{ user }` + `pm_session` cookie. 401 `{ error: "Invalid email or password" }`. 403 `{ error, code: "EMAIL_NOT_VERIFIED" }` if not verified. |
| POST | `/auth/forgot-password` | `{ email }` | 200 `{ ok: true }` always. Sends a reset link (1 h). |
| POST | `/auth/reset-password` | `{ token, password }` | 200 `{ ok: true }`. Revokes all sessions and signs in. 400 if invalid or expired. |
| GET | `/auth/me` | | `{ user: { id, email, name, emailVerified } }` or 401 |
| POST | `/auth/logout` | | 204 |
| POST | `/auth/dev-login` | unchanged (dev only) | |

Email links point to the web app: `${PUBLIC_URL}/verify-email?token=…` and `${PUBLIC_URL}/reset-password?token=…`.
Tokens are 32 random bytes; the DB stores only their sha256. Passwords are hashed with scrypt (node:crypto) with a per-user salt.

## Gmail (per user, signed in)
- `GET /gmail/status` → `{ connected, email, authType: "APP_PASSWORD" | null, dryRun }`.
- `POST /gmail/app-password` `{ email, appPassword }`: unchanged (verifies SMTP + IMAP, stores the password encrypted). Always enabled.
- `POST /gmail/disconnect`, `POST /gmail/test-send` (to the user's own login email): unchanged.
- `/gmail/connect` and `/gmail/callback` are removed.


## v3.1: password is set on the verification page (account-takeover fix)

- `POST /auth/signup` takes `{ name, email }` only (no password). New address: creates an unverified user with no password and emails a link. Unverified existing address: nothing changes, a fresh link is emailed. Verified address: a "someone tried to sign up" note. Always 201 `{ ok: true }`.
- `POST /auth/verify-email` takes `{ token, password }` (8-200 chars): sets the password, marks the email verified, revokes all other sessions, signs in. Returns `{ ok: true, user }`. The web page `/verify-email?token=...` shows a "Set your password" form.
- Only the mailbox owner can set a password (verify link or reset link), so signing up with someone else's address gives no access.
- Login failures are limited per (email, IP) (10 / 15 min) and per email overall (50 / 15 min).
- `/auth/me` and `/auth/logout` are not rate limited. `TRUST_PROXY_HOPS` (default 1; 2 on Render behind the Vercel rewrite) sets how many proxies to trust for the client IP.
- All error responses may include a machine-readable `code`.

## v3.2: hardening after QA round 4
- `POST /auth/signup` takes `{ email }` (a `name` is accepted and ignored). `POST /auth/verify-email` takes `{ token, name, password }`: the mailbox owner chooses both. The token is checked before the password is hashed.
- `GET /auth/verify-email/check?token=…` → `{ valid: boolean }` (does not consume). The verify page calls it on load.
- System emails never include user-supplied names ("Hi,").
- Client IP for rate limits: the web proxy (`web/src/proxy.ts`, runs before the `/api` rewrite) strips any client `x-pm-*` headers and, on Vercel, sends `x-pm-client-ip` + `x-pm-proxy-secret`. The API trusts `x-pm-client-ip` only when `x-pm-proxy-secret` equals `API_PROXY_SECRET` (same value on Vercel and Render). Otherwise it uses `req.ip` with `TRUST_PROXY_HOPS=1`, i.e. the address that reached Render, so a spoofed `X-Forwarded-For` can't choose a rate-limit bucket.

## v3.3: admin
Admins are normal accounts whose email is listed in the API env `ADMIN_EMAILS` (comma-separated, case-insensitive). There is no admin password and no DB role: `isAdmin` is derived from the env on every request (change it and restart the API).

- `GET /auth/me`, `POST /auth/login`, `/auth/dev-login`, `/auth/verify-email`, `/auth/reset-password` → `user` gains `isAdmin: boolean`.
- **Blocking**: `User.blockedAt` (nullable). A blocked user:
  - `POST /auth/login` (correct password) and `/auth/dev-login` → 403 `{ error: "This account has been blocked.", code: "ACCOUNT_BLOCKED" }`. `/auth/verify-email` and `/auth/reset-password` still consume the link (and set the password) but answer the same 403 without signing in.
  - All sessions are revoked when blocked (so existing cookies get 401). Should a session still exist, `/auth/me` and every signed-in route answer 403 `ACCOUNT_BLOCKED`.
  - SCHEDULED / SENDING emails are left as they are, but the scheduler (send-due, reply checks, stale-SENDING reset) skips blocked users, so nothing is sent until they are unblocked.

All admin routes require a verified, non-blocked session whose email is in `ADMIN_EMAILS`; anyone else (signed in or not) gets 404 `{ error: "Not found" }`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/admin/users?q=` | | `AdminUser[]` ordered by `createdAt` desc, at most 500. `q` matches email or name (case-insensitive substring). |
| POST | `/admin/users/:id/block` | | `AdminUser` (updated). 400 `CANNOT_BLOCK_SELF` / `CANNOT_BLOCK_ADMIN`; 404 if no such user. Idempotent. |
| POST | `/admin/users/:id/unblock` | | `AdminUser` (updated). 404 if no such user. Idempotent. |
| GET | `/admin/stats` | | `{ users, verifiedUsers, blockedUsers, gmailConnected, emailsSentToday, emailsSentTotal, emailsScheduled }` |

`AdminUser = { id, email, name, createdAt, emailVerified, blocked, blockedAt, isAdmin, gmailConnected, gmailEmail, professorCount, emailsSent, emailsScheduled, lastSentAt }`. `emailsScheduled` counts SCHEDULED + SENDING; `emailsSentToday` uses the Asia/Karachi calendar day. Password hashes, tokens and app passwords are never returned. Admin actions are logged as `[admin] <adminId> blocked|unblocked <userId>` (ids only).

## v4: companies (job applications) and CV attachment
The `Professor` model is now a **contact**: `kind: "PROFESSOR" | "COMPANY"` (default PROFESSOR). The REST paths stay `/professors` (the UI calls them "Contacts"). Migration `contacts_companies_cv` is already applied.

**Contact fields** (Professor JSON gains): `kind`, `role: string|null`, `jobUrl: string|null`.
- For companies, `university` holds the **company name** and `name` the recruiter / HR person (or "Hiring Team"); `role` = job title, `jobUrl` = posting link. `researchFocus` is optional for companies (can hold skills/stack); `whyFits` = why you fit the role.
- Status gains `INTERVIEW` (order: NOT_SENT, SENT, REPLIED, INTERESTED, INTERVIEW, DECLINED). INTERVIEW behaves like INTERESTED: it is a stop status (send-due cancels due emails with "Contact marked interview", reply check never downgrades it to REPLIED). UI label for DECLINED on a company may read "Rejected"; the value stays DECLINED.
- `POST/PATCH /professors` accept `kind`, `role`, `jobUrl` (optStr; `jobUrl` must be http(s) if given). `GET /professors?kind=PROFESSOR|COMPANY` filters (plus existing status/country/q; q also matches `role`). Error text says "contact" instead of "professor".
- `EmailWithProfessor.professor` (summary select) gains `kind` and `role`.

**Placeholders**: `{{name}}`, `{{university}}`, `{{company}}` (= university), `{{role}}`, `{{jobUrl}}`, `{{researchFocus}}`, `{{whyFits}}`. Unknown-placeholder 400 lists the new `allowed`.

**Templates**: gain `attachCv: boolean` (default false) on create / patch / response.

**Emails**: gain `attachCv: boolean`. Set from the template when an email is created (import with a template, follow-ups from the follow-up template). Import commit accepts optional `attachCv: boolean` that overrides for all rows (default: the chosen template's `attachCv`, else false). `PATCH /emails/:id` may also take `attachCv: boolean` (SCHEDULED only).

**CV** (one per user, stored in Postgres as bytes; PDF, DOC or DOCX, max 5 MB, checked by extension + magic bytes: `%PDF` or `PK\x03\x04` for docx or `D0 CF 11 E0` for doc):
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/cv` | | `{ cv: { filename, mimeType, size, updatedAt } \| null }` |
| POST | `/cv` | multipart, field `file` | `{ cv: {...} }` (replaces any existing). 400 wrong type / too big / empty. |
| GET | `/cv/download` | | the file (`Content-Disposition: attachment`), 404 if none |
| DELETE | `/cv` | | 204 |
Filename is sanitised (basename, no control chars, max 120 chars).

**Sending**: when `email.attachCv` is true the send-due job loads the user's CV and attaches it (nodemailer `attachments`). If there is no CV the email becomes FAILED with error "CV attachment missing: upload your CV in Settings" (the daily counter is not used). DRY_RUN logs `attachment=<filename>` (or `(none)`), never the bytes. Test-send is unchanged (no attachment).

**Settings**: gain `companyFollowUpTemplateId: string|null` (must be a follow-up template of the user, same rules as `followUpTemplateId`). Follow-ups for COMPANY contacts use it, falling back to `followUpTemplateId`, then any follow-up template. Follow-ups copy `attachCv` from the template used.

**Import**: new optional columns `type` (alias `kind`; values `professor`/`company`, case-insensitive, empty = professor, anything else = row error), `company` (used as `university` when `university` is empty; the required check is "university or company"), `role`, `jobUrl`. Sample CSV includes a company row. Preview rows include `kind`, `role`, `jobUrl`. Upsert by (user, email) also updates kind/role/jobUrl.

**Dashboard**: `GET /dashboard` gains `contacts: { professors: number, companies: number }`.

### v4.1: separate Professors / Companies pages
- `GET /import/sample.csv?type=professor|company` returns a sample with only that kind's columns (company sample uses `skills` for researchFocus). Without `type` the mixed sample is returned.
- Import preview (form field) and commit (body) accept `type: "professor" | "company"`. Rows with an empty `type` get that kind; rows of the other kind are errors, and the matching column is required (`company` for companies, `university` for professors).
- Header aliases: `skills` → researchFocus, `contact person` → name, `job link` → jobUrl.
- Web: `/professors` and `/companies` (+ `/companies/:id`), import at `/import?type=company`.
