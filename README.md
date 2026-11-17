# prof-mailer

An app for emailing university professors about Master's admissions. You sign in with Google, import professors from a CSV or XLSX file, schedule personalised emails, send them through your own Gmail account, detect replies, and send polite follow-ups in the same thread. Each user has their own professors, templates, queue, settings and connected Gmail.

- `api/`: Express, TypeScript, Prisma 6 and Postgres (Neon), with node-cron jobs running in the same process. Local port **4100**.
- `web/`: Next.js (App Router) and Tailwind. Local port **3100**. The browser only talks to the web origin; Next.js rewrites `/api/*` to the API (`API_ORIGIN`), so the session cookie is first-party.
- `docs/API_CONTRACT.md`: the REST contract (see the "Multi-user (v2)" section).

Production shape: **web on Vercel**, **API on Render (free)**, **database on Neon**, and **cron-job.org** pinging the API.

All times are stored in UTC and shown in **Asia/Karachi** (PKT, UTC+5). The `scheduledAt` column in an import file is Karachi local time.

> **Safety:** `DRY_RUN=true` is the default. In dry-run mode no email is sent. The scheduler only logs what it would send and marks the email as SENT, so you can test the whole flow. Real emails go out only after you set `DRY_RUN=false`. `DRY_RUN` is global (it applies to every user).

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
| `PUBLIC_URL` | The web origin: `http://localhost:3100` locally, your Vercel URL in production. OAuth redirect URIs are derived from it. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | One Google OAuth client used for both sign-in and Gmail (see section 2). |
| `DEV_LOGIN_ENABLED` | `true` lets you sign in locally without Google (`POST /api/auth/dev-login {"email": "..."}`). Ignored when `NODE_ENV=production`. |
| `DRY_RUN` | `true` while testing. See [Switching DRY_RUN off](#6-switching-dry_run-off). |
| `CRON_SECRET` | Long random string. Required in production. Protects `/api/jobs/*`. Leave empty locally to disable those endpoints (the in-process scheduler still runs). |
| `ENCRYPTION_KEY` | 64 hex chars. Required in production. Encrypts stored Gmail app passwords. Locally, if empty, a key is created in `api/.data/secret.key`. |
| `APP_PASSWORD_ENABLED` | `false` (default). The App Password (SMTP/IMAP) option only works where outbound SMTP is allowed; Render's free plan blocks it. |
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

Open <http://localhost:3100> and sign in with Google, or with dev login when `DEV_LOGIN_ENABLED=true`.

## 2. Google Cloud setup (sign-in + Gmail)

One OAuth client serves both "Sign in with Google" and each user's Gmail connection.

1. Open <https://console.cloud.google.com/> and create a project (for example "prof-mailer").
2. **APIs & Services → Library**: enable the **Gmail API**.
3. **Google Auth Platform → Branding / Audience** (the OAuth consent screen): user type **External**, app name, support email, developer contact.
4. **Data access (scopes)**: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `.../auth/gmail.send` and `.../auth/gmail.readonly`.
5. **Clients → Create client → Web application**. Add these **Authorised redirect URIs**:
   - `http://localhost:3100/api/auth/google/callback`
   - `http://localhost:3100/api/gmail/callback`
   - `https://<your-app>.vercel.app/api/auth/google/callback`
   - `https://<your-app>.vercel.app/api/gmail/callback`

   Copy the **Client ID** and **Client secret** into `api/.env` (and into Render later).

The redirect URIs point at the **web** origin on purpose: Vercel proxies `/api/*` to Render, so cookies stay on one domain.

### Testing mode vs. open to everyone (read this)

- While the app's publishing status is **Testing**, only Google accounts you add under **Audience → Test users** can sign in. The limit is **100 test users**, and you add each one by hand.
- In Testing mode Google **expires refresh tokens after 7 days**. Each user then has to click **Connect Gmail** again before sending and reply checks work.
- To let anyone sign in, the app must be **published and verified by Google**. `gmail.readonly` is a **restricted scope**. Verification for restricted scopes requires a third-party **CASA security assessment**, which takes time and usually costs money. Until that is done, keep the app in Testing and add your users as test users. (Sign-in alone with `openid email profile` needs no special review. The Gmail scopes are what require it.)

## 3. Deploy the API on Render

The repo has a Blueprint at `render.yaml`. It runs the API from `api/` on the free plan, runs `prisma migrate deploy` on every build, and uses `/api/health` as the health check.

1. Render dashboard → **New → Blueprint** → pick this repository.
2. Fill in the secret env vars it asks for:
   - `DATABASE_URL`, `DIRECT_URL` (Neon)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `ENCRYPTION_KEY`, `CRON_SECRET` (random, see the command above)
   - `PUBLIC_URL` = your Vercel URL, for example `https://prof-mailer.vercel.app` (no trailing slash)
3. The plain values are preset: `NODE_ENV=production`, `DRY_RUN=true`, `SCHEDULER_ENABLED=true`, `APP_PASSWORD_ENABLED=false`.

Notes:
- The free plan sleeps after about 15 minutes without traffic. The cron-job.org ping (section 5) keeps it awake so the in-process scheduler keeps running.
- Render's free plan blocks outbound SMTP, so Gmail is connected with Google OAuth (Gmail API) only.

## 4. Deploy the web app on Vercel

1. Vercel → **Add New → Project** → import this repository and set **Root Directory** to `web`.
2. Environment variable: `API_ORIGIN` = your Render URL, for example `https://prof-mailer-api.onrender.com`. It is read at build time, so redeploy after changing it.
3. Deploy, then make sure `PUBLIC_URL` on Render is exactly this Vercel URL, and that the two Vercel redirect URIs are in the Google client.

Mutating requests must come from `PUBLIC_URL` (the API checks the `Origin` header), so use the production Vercel URL, not a preview URL.

## 5. cron-job.org

Create two jobs at <https://cron-job.org>:

1. **Keep-alive**: `GET https://<render-url>/api/health` every **10 minutes**.
2. **Optional backup tick**: `GET https://<render-url>/api/jobs/tick` every **10 minutes** with the request header `Authorization: Bearer <CRON_SECRET>`. It runs send-due and, if the last check was at least 60 minutes ago, check-replies. It is safe alongside the in-process scheduler, which has a mutex and stores the last reply check in the database.

## 6. Switching DRY_RUN off

1. Each user connects Gmail on the **Gmail** page and uses **Send test email**. It only ever goes to that user's own Google address.
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

## Useful commands

```powershell
cd api
npm run typecheck        # tsc --noEmit
npm run build            # tsc -> dist/ (npm start runs node dist/index.js)
npx prisma studio        # browse the DB
npx prisma migrate dev   # after editing prisma/schema.prisma
```
