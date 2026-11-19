# prof-mailer

An app for emailing university professors about Master's admissions, and companies about jobs. You create an account with your email and a password, connect the Gmail account you send from with a Google App Password, import professors from a CSV or XLSX file, schedule personalised emails, send them through your own Gmail account, detect replies, and send polite follow-ups in the same thread. Each user has their own professors, templates, queue, settings and connected Gmail.

- `api/`: Express, TypeScript, Prisma 6 and Postgres (Neon), with node-cron jobs running in the same process. Local port **4100**.
- `web/`: Next.js (App Router) and Tailwind. Local port **3100**. The browser only talks to the web origin; Next.js rewrites `/api/*` to the API (`API_ORIGIN`), so the session cookie is first-party.
- `docs/API_CONTRACT.md`: the REST contract (the "v3" section at the end supersedes the earlier Google sections).

Production shape: **web on Vercel**, **API on Render (free)**, **database on Neon**, and **cron-job.org** pinging the API.

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

Account emails are sent from **your own mailbox** (the app owner's), for example a `no-reply@programmingbridge.org` address at your mail provider. Put its SMTP settings in `api/.env` (and Render):

| Variable | Example |
|---|---|
| `SMTP_HOST` | `mail.example.org` (your provider's SMTP server) |
| `SMTP_PORT` | `465` (implicit TLS, the default) or `587` (STARTTLS) |
| `SMTP_SECURE` | Optional. Defaults to `true` for port 465 and `false` otherwise (587 then upgrades with STARTTLS). |
| `SMTP_USER` / `SMTP_PASS` | The mailbox login |
| `MAIL_FROM` | `prof-mailer <no-reply@example.org>` (use an address the mailbox may send as) |

- Without `SMTP_HOST` (local development only) the API prints the verification / reset link in its console instead of sending it. In production the API refuses to start without SMTP settings.
- These emails are sent even when `DRY_RUN=true`, so people can sign up while professor emails are still dry-run.
- **Hosting note:** Render's **free** plan blocks outbound SMTP ports 25, 465 and 587. Use a host or plan that allows SMTP (for example **Render Starter**), or, only if your mail provider supports it, `SMTP_PORT=2525`. Gmail's `smtp.gmail.com` does **not** accept port 2525, so the per-user Gmail App Password sending below also needs SMTP-allowed hosting.

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
2. Put your login email in the API env var `ADMIN_EMAILS` (comma-separated for several admins, e.g. `you@example.org,other@example.org`). Locally in `api/.env`, on Render in the service's environment.
3. Restart the API (Render restarts on env changes). Reload the web app: an **Admin** item appears under Setup.

The Admin page shows totals (users, verified, blocked, Gmail connected, emails sent today / in total, scheduled) and every account with its counts. **Block** signs the user out everywhere and stops them from signing in; their scheduled emails stay in the queue but the scheduler skips them until you **Unblock**. Admins can't block themselves or other admins. Removing an email from `ADMIN_EMAILS` (and restarting) removes admin rights.

## 3. Deploy the API on Render

The repo has a Blueprint at `render.yaml`. It runs the API from `api/` on the free plan, runs `prisma migrate deploy` on every build, and uses `/api/health` as the health check.

1. Render dashboard → **New → Blueprint** → pick this repository.
2. Fill in the secret env vars it asks for:
   - `DATABASE_URL`, `DIRECT_URL` (Neon)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (section 2)
   - `ENCRYPTION_KEY`, `CRON_SECRET` (random, see the command above)
   - `API_PROXY_SECRET`: another long random string. Put the **same value** on Vercel. It lets the API trust the browser IP that Vercel forwards (used for rate limits); without it, everyone behind Vercel shares one rate-limit bucket.
   - `PUBLIC_URL` = your Vercel URL, for example `https://prof-mailer.vercel.app` (no trailing slash)
   - `ADMIN_EMAILS` (optional): your login email, to get the Admin page (see [Admins](#admins))
3. The plain values are preset: `NODE_ENV=production`, `DRY_RUN=true`, `SCHEDULER_ENABLED=true`.

Notes:
- The free plan sleeps after about 15 minutes without traffic. The cron-job.org ping (section 5) keeps it awake so the in-process scheduler keeps running.
- Render's free plan blocks outbound SMTP (25/465/587). System mail and Gmail App Password sending both need SMTP, so use a plan that allows it (for example Starter). The Blueprint says `plan: free`; change it if you deploy there.

## 4. Deploy the web app on Vercel

1. Vercel → **Add New → Project** → import this repository and set **Root Directory** to `web`.
2. Environment variables:
   - `API_ORIGIN` = your Render URL, for example `https://prof-mailer-api.onrender.com`. It is read at build time, so redeploy after changing it.
   - `API_PROXY_SECRET` = the same value as on Render.
3. Deploy, then make sure `PUBLIC_URL` on Render is exactly this Vercel URL. Verification and reset links use it.

Mutating requests must come from `PUBLIC_URL` (the API checks the `Origin` header), so use the production Vercel URL, not a preview URL.

## 5. cron-job.org

Create two jobs at <https://cron-job.org>:

1. **Keep-alive**: `GET https://<render-url>/api/health` every **10 minutes**.
2. **Optional backup tick**: `GET https://<render-url>/api/jobs/tick` every **10 minutes** with the request header `Authorization: Bearer <CRON_SECRET>`. It runs send-due and, if the last check was at least 60 minutes ago, check-replies. It is safe alongside the in-process scheduler, which has a mutex and stores the last reply check in the database.

## 6. Switching DRY_RUN off

1. Each user connects Gmail on the **Gmail** page (App Password) and uses **Send test email**. It only ever goes to that user's own login address.
2. Review the **Queue** carefully. Anything scheduled in the past is sent on the next tick.
3. Set `DRY_RUN=false` (in Render: Environment, then save, which redeploys; locally: `api/.env`, then restart the API). The header's "DRY RUN" badge disappears.

To stop all sending at any time, set `DRY_RUN=true` again, or set `SCHEDULER_ENABLED=false` and pause the cron-job.org tick.

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

- **Contacts** holds both professors and companies. Use the Professor / Company switch in the form, or the `type` column (`professor` / `company`) in an import file.
- For a company, fill in **Company**, **Role**, **Contact person** (HR or recruiter name, or "Hiring Team"), the email, an optional **Job link**, and **Why you fit**. Import columns: `type`, `company`, `role`, `jobUrl` (the sample CSV has a company row).
- Template placeholders for jobs: `{{company}}`, `{{role}}`, `{{jobUrl}}` (plus `{{name}}` and `{{whyFits}}`). Example subject: `Application: {{role}} at {{company}}`.
- **CV**: upload it once in **Settings** (PDF, DOC or DOCX, up to 5 MB). Tick **Attach my CV** on a template (or in Import) and every email made from it carries the CV. If the CV is missing at send time the email is marked FAILED with a clear message.
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
