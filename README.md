# prof-mailer

An app for emailing university professors about Master's admissions, and companies about jobs. You create an account with your email and a password, connect the Gmail account you send from with a Google App Password, import professors from a CSV or XLSX file, schedule personalised emails, send them through your own Gmail account, detect replies, and send polite follow-ups in the same thread. Each user has their own professors, templates, queue, settings and connected Gmail.

- `api/`: Express, TypeScript, Prisma 6 and Postgres (Neon), with node-cron jobs running in the same process. Local port **4100**.
- `web/`: Next.js (App Router) and Tailwind. Local port **3100**. The browser only talks to the web origin; Next.js rewrites `/api/*` to the API (`API_ORIGIN`), so the session cookie is first-party.
- `docs/API_CONTRACT.md`: the REST contract (the "v3" section at the end supersedes the earlier Google sections).

Production shape: **two Vercel projects from this repo** (`web/` and `api/`), **database on Neon**, and **cron-job.org** calling the API's scheduler tick.

All times are stored in UTC and shown in **Asia/Karachi** (PKT, UTC+5). The `scheduledAt` column in an import file is Karachi local time.

> **Safety:** `DRY_RUN=true` is the default. In dry-run mode no email is sent. The scheduler only logs what it would send and marks the email as SENT, so you can test the whole flow. Real emails go out only after you set `DRY_RUN=false`. `DRY_RUN` is global (it applies to every user). Account emails (verification, password reset) are **not** affected by `DRY_RUN`.

---

## 1. Local development (Windows)

Prerequisites: Node.js 20 or newer and a Neon Postgres database (the free tier is fine).

```powershell
cd C:\Users\Farhan\prof-mailer\api
npm install
Copy-Item .env.example .env      # then edit .env (see below)
npx prisma migrate deploy        # create / update the tables

cd ..\web
npm install
Copy-Item .env.example .env.local   # API_ORIGIN=http://localhost:4100
```

### `api/.env`

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (the host contains `-pooler`). Paste only the `postgresql://...` URL. |
| `DIRECT_URL` | Neon **direct** connection string (same, without `-pooler`). Prisma migrations use it. |
| `PORT` | `4100` |
| `PUBLIC_URL` | The web origin: `http://localhost:3100` locally, your Vercel URL in production. Verification and reset links point to it. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | The mailbox that sends account emails (verification, password reset). See section 2. Required in production; locally you can leave `SMTP_HOST` empty and the links are printed in the API console. |
| `DEV_LOGIN_ENABLED` | `true` lets you sign in locally without a password (`POST /api/auth/dev-login {"email": "..."}`). Ignored when `NODE_ENV=production`. |
| `ADMIN_EMAILS` | Optional. Comma-separated login emails of admins (case-insensitive). Admins get an **Admin** page (`/admin`) to see all users and block or unblock them. See [Admins](#admins). |
| `DRY_RUN` | `true` while testing. See [Switching DRY_RUN off](#6-switching-dry_run-off). |
| `CRON_SECRET` | Long random string. Required in production. Protects `/api/jobs/*`. Leave empty locally to disable those endpoints (the in-process scheduler still runs). |
| `ENCRYPTION_KEY` | 64 hex chars. Required in production. Encrypts stored Gmail App Passwords. Locally, if empty, a key is created in `api/.data/secret.key`. |
| `COOKIE_SECURE` | Optional. Defaults to `true` in production and `false` otherwise. |
| `SEND_DELAY_MIN_MS` / `SEND_DELAY_MAX_MS` | Minimum random gap between two sends of the same user. Defaults 30000 and 120000. |

Generate secrets with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Run

```powershell
# window 1: API (http://localhost:4100/api)
cd C:\Users\Farhan\prof-mailer\api
npm run dev

# window 2: web (http://localhost:3100)
cd C:\Users\Farhan\prof-mailer\web
npm run dev
```

Open <http://localhost:3100>, sign up, and open the verification link (printed in the API console when SMTP is not configured). Or use dev login when `DEV_LOGIN_ENABLED=true`.

## 2. Accounts, system mail and Gmail

### System mail (verification and password reset)

Account emails are sent from **your own mailbox** (the app owner's), for example a `no-reply@programmingbridge.org` address at your mail provider. Put its SMTP settings in `api/.env` (and the Vercel API project):

| Variable | Example |
|---|---|
| `SMTP_HOST` | `mail.example.org` (your provider's SMTP server) |
| `SMTP_PORT` | `465` (implicit TLS, the default) or `587` (STARTTLS) |
| `SMTP_SECURE` | Optional. Defaults to `true` for port 465 and `false` otherwise (587 then upgrades with STARTTLS). |
| `SMTP_USER` / `SMTP_PASS` | The mailbox login |
| `MAIL_FROM` | `prof-mailer <no-reply@example.org>` (use an address the mailbox may send as) |

- Without `SMTP_HOST` (local development only) the API prints the verification / reset link in its console instead of sending it. In production the API refuses to start without SMTP settings.
- These emails are sent even when `DRY_RUN=true`, so people can sign up while professor emails are still dry-run.
- **Hosting note:** Vercel Functions allow outbound SMTP on ports 465 and 587 (only 25 is blocked), so system mail and Gmail App Password sending work there. Render's **free** plan blocks SMTP.

### User flow

1. **Sign up** with name, email and a password (8+ characters).
2. **Verify** the address with the link in the email (valid 24 hours; you can request a new one). Forgot the password? The reset link is valid for 1 hour and signs out every other session.
3. **Connect Gmail** on the Gmail page with a **Google App Password**:
   - Turn on **2-Step Verification** for the Google account (<https://myaccount.google.com/security>).
   - Create an App Password at <https://myaccount.google.com/apppasswords> and paste the 16 letters with your Gmail address.
   - Make sure IMAP is enabled in Gmail (Settings → Forwarding and POP/IMAP). The API checks the SMTP and IMAP login before saving and stores the App Password encrypted.
   - Sending uses `smtp.gmail.com:465`; reply checks read Sent / All Mail over `imap.gmail.com:993`.
4. Use **Send test email** (it only goes to your own login address) before `DRY_RUN=false`.

### Admins

There is no separate admin password. To become an admin:

1. Sign up and verify your account normally.
2. Put your login email in the API env var `ADMIN_EMAILS` (comma-separated for several admins, e.g. `you@example.org,other@example.org`). Locally in `api/.env`, in production in the Vercel API project's environment variables.
3. Restart the API (on Vercel: redeploy after changing env vars). Reload the web app: an **Admin** item appears under Setup.

The Admin page shows totals (users, verified, blocked, Gmail connected, emails sent today / in total, scheduled) and every account with its counts. **Block** signs the user out everywhere and stops them from signing in; their scheduled emails stay in the queue but the scheduler skips them until you **Unblock**. Admins can't block themselves or other admins. Removing an email from `ADMIN_EMAILS` (and restarting) removes admin rights.

## 3. Deploy on Vercel (two projects)

The API (`api/`) runs as one Vercel Function (`api/api/index.js` → the compiled Express app; config in `api/vercel.json`). The build runs `prisma migrate deploy` and `tsc`. There is no always-on process on Vercel, so the scheduler runs when cron-job.org calls `/api/jobs/tick` (section 5).

Push the repo to GitHub first, then:

### 3a. API project

1. Vercel → **Add New → Project** → import the repository. **Root Directory: `api`**. Framework preset: **Other** (the `vercel.json` sets the build).
2. Environment variables (Production). Easiest: open `api/.env`, copy its content and paste it into Vercel's environment variable form (it accepts a pasted `.env`), then change / add:
   - `NODE_ENV` = `production`
   - `PUBLIC_URL` = the web URL from step 3b, for example `https://prof-mailer.vercel.app` (no trailing slash). If you don't know it yet, put the expected URL and fix it after 3b (then redeploy).
   - `ENCRYPTION_KEY` = the content of `api/.data/secret.key` if you want Gmail App Passwords saved locally to keep working (local and production share the Neon database); otherwise a new 64-hex key (then reconnect Gmail).
   - `CRON_SECRET` and `API_PROXY_SECRET` = two new long random strings (command above).
   - Keep `DATABASE_URL`, `DIRECT_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `ADMIN_EMAILS`, `DRY_RUN=true`.
   - Remove `PORT`, `DEV_LOGIN_ENABLED` (ignored in production anyway).
3. Deploy. Check `https://<api-project>.vercel.app/api/health` returns `{"status":"ok","db":"up"}`.

### 3b. Web project

1. **Add New → Project** → the same repository, **Root Directory: `web`** (Next.js is detected).
2. Environment variables:
   - `API_ORIGIN` = the API project URL, for example `https://prof-mailer-api.vercel.app`. It is read at build time, so redeploy after changing it.
   - `API_PROXY_SECRET` = the same value as in the API project.
3. Deploy. Make sure `PUBLIC_URL` in the API project is exactly this URL (verification and reset links use it, and mutating requests must come from it). Use the production URL, not a preview URL.

Limits on Vercel: uploads (CV, import files) are capped at 4 MB, and a scheduler tick may run up to 300 s.

## 4. Alternative: API on Render

`render.yaml` still describes the API as a Render web service with the in-process scheduler. Render's free plan blocks SMTP, so use a paid plan there. The web project stays on Vercel with `API_ORIGIN` pointing to Render.

## 5. cron-job.org (required on Vercel)

Create a job at <https://cron-job.org>:

- URL `https://<api-project>.vercel.app/api/jobs/tick`, method GET, **every 5 minutes**, request header `Authorization: Bearer <CRON_SECRET>`.
- Each tick sends at most one due email per user (with the 30–120 s spacing and the daily limit) and, if the last check was at least 60 minutes ago, checks replies and schedules follow-ups. Every 1–5 minutes is fine; more often sends a full day's limit sooner.

## 6. Switching DRY_RUN off

1. Each user connects Gmail on the **Gmail** page (App Password) and uses **Send test email**. It only ever goes to that user's own login address.
2. Review the **Queue** carefully. Anything scheduled in the past is sent on the next tick.
3. Set `DRY_RUN=false` (Vercel API project: Settings → Environment Variables, then redeploy; locally: `api/.env`, then restart the API). The header's "DRY RUN" badge disappears.

To stop all sending at any time, set `DRY_RUN=true` again (and redeploy), or pause the cron-job.org job.

Sending rules for each user: at most one email per scheduler tick, at least a random 30–120 s between sends, and no more than `dailySendLimit` per Karachi day. The limit can be set up to 50.

## 7. Typical workflow

1. **Templates**: create an initial template and a follow-up template (tick *Is follow-up*). Placeholders: `{{name}}`, `{{university}}`, `{{researchFocus}}`, `{{whyFits}}`.
2. **Settings**: choose the follow-up template, `followUpAfterDays` (default 3), `maxFollowUps` (default 2) and `dailySendLimit` (default 20, max 50).
3. **Import**: download the sample CSV, fill it in, upload it, check the preview (rows with errors show in red) and confirm. Rows with an empty subject or body use the selected template.
4. **Queue**: check, cancel or reschedule what will go out.
5. The scheduler sends due emails within the limits above. Every hour it checks Gmail threads for replies:
   - If a professor replied, they are marked **REPLIED** and their pending follow-ups are cancelled.
   - If there is no reply after `followUpAfterDays`, a follow-up is scheduled in the **same Gmail thread** ("Re: …").
6. **Sent / Professors**: view history and each professor's thread. You can also mark professors INTERESTED or DECLINED manually.

## 8. Companies (job applications) and CV

- The sidebar has separate **Professors** and **Companies** pages. Each has its own **New** button and an **Import** button that opens the import page for that type.
- **Import** has a Professors / Companies switch, and each one downloads its own sample (`prof-mailer-professors-sample.csv` or `prof-mailer-companies-sample.csv`). Company columns: `company, role, name, email, jobUrl, country, skills, whyFits, subject, body, scheduledAt` (`name` = recruiter / HR person or "Hiring Team"). A file of the wrong type shows "company is required" / "university is required" on every row.
- Template placeholders for jobs: `{{company}}`, `{{role}}`, `{{jobUrl}}` (plus `{{name}}` and `{{whyFits}}`). Example subject: `Application: {{role}} at {{company}}`.
- **CV**: upload it once in **Settings** (PDF, DOC or DOCX, up to 4 MB). Tick **Attach my CV** on a template (or in Import) and every email made from it carries the CV. If the CV is missing at send time the email is marked FAILED with a clear message.
- **Settings → Company follow-up template**: follow-ups to companies use it (otherwise the normal follow-up template).
- Statuses: **Interview** (stops further emails, like Interested) and **Rejected** (shown for companies; same as Declined).

## Useful commands

```powershell
cd api
npm run typecheck        # tsc --noEmit
npm run build            # tsc -> dist/ (npm start runs node dist/index.js)
npx prisma studio        # browse the DB
npx prisma migrate dev   # after editing prisma/schema.prisma
```
