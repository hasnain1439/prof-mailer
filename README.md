# prof-mailer

A personal app for emailing university professors about Master's admissions. You can import professors from a CSV or XLSX file, schedule personalised emails, send them through your own Gmail account, detect replies, and send polite follow-ups in the same thread.

- `api/`: Express, TypeScript, Prisma 6 and Postgres (Neon), with node-cron jobs running in the same process. Port **4000**.
- `web/`: Next.js (App Router) and Tailwind. Port **3000**.
- `docs/API_CONTRACT.md`: the REST contract.

All times are stored in UTC and shown in **Asia/Karachi** (PKT, UTC+5). The `scheduledAt` column in an import file is Karachi local time.

> **Safety:** `DRY_RUN=true` is the default. In dry-run mode no email is sent. The scheduler only logs what it would send and marks the email as SENT, so you can test the whole flow. Real emails go out only after you set `DRY_RUN=false`.

---

## 1. Prerequisites (Windows)

- Node.js 20 or newer (`node -v`)
- A Neon Postgres database (free tier is fine)
- A Google account whose Gmail will send the emails

## 2. Install

```powershell
cd C:\Users\Farhan\prof-mailer\api
npm install
Copy-Item .env.example .env      # then edit .env (see below)

cd ..\web
npm install
Copy-Item .env.example .env.local
```

## 3. Configure `api/.env`

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string. In Neon's Connect dialog it is the host containing `-pooler`. Paste only the `postgresql://...` URL, not the `psql '...'` command. |
| `DIRECT_URL` | Neon **direct** connection string (same, without `-pooler`). Prisma migrations use it. |
| `DRY_RUN` | `true` while testing. See [Switching DRY_RUN off](#7-switching-dry_run-off). |
| `TEST_RECIPIENT` | Your own email address. The "Send test email" button only ever sends to this address. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From step 4. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:4000/api/gmail/callback` |
| `SEND_DELAY_MIN_MS` / `SEND_DELAY_MAX_MS` | Random pause between sends. Defaults are 30000 and 120000 (30–120 s). |

Then create the tables:

```powershell
cd C:\Users\Farhan\prof-mailer\api
npx prisma migrate deploy
```

## 4. Create Google OAuth credentials

1. Open <https://console.cloud.google.com/> and create a project (for example "prof-mailer").
2. **APIs & Services → Library**: search **Gmail API** and click **Enable**.
3. **APIs & Services → OAuth consent screen** (also called "Google Auth Platform"):
   - User type **External**, app name "prof-mailer", your email as support and developer contact.
   - **Scopes**: add `.../auth/gmail.send` and `.../auth/gmail.readonly`.
   - **Test users**: add the Gmail address you will send from. The app stays in "Testing" mode, which is fine for personal use.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - Authorised redirect URI: `http://localhost:4000/api/gmail/callback`
   - Click **Create** and copy the **Client ID** and **Client secret** into `api/.env`.
5. Start the app (step 5), open <http://localhost:3000/gmail> and click **Connect Gmail**. Google warns that the app is unverified. Click *Continue*, because it is your own app. The refresh token is stored in the database (`GmailAccount` table).

> If the app is in "Testing" mode, Google expires refresh tokens after 7 days. When sending starts failing with an auth error, click **Connect Gmail** again.

## 5. Run

Use two PowerShell windows:

```powershell
# window 1: API (http://localhost:4000/api)
cd C:\Users\Farhan\prof-mailer\api
npm run dev

# window 2: web (http://localhost:3000)
cd C:\Users\Farhan\prof-mailer\web
npm run dev
```

For production-style runs, use `npm run build` then `npm start` in each folder.

## 6. Typical workflow

1. **Templates**: create an initial template and a follow-up template (tick *Is follow-up*). Placeholders: `{{name}}`, `{{university}}`, `{{researchFocus}}`, `{{whyFits}}`.
2. **Settings**: choose the follow-up template, `followUpAfterDays` (default 3), `maxFollowUps` (default 2) and `dailySendLimit` (default 20).
3. **Import**: download the sample CSV, fill it in, upload it, check the preview (rows with errors show in red) and confirm. Rows with an empty subject or body use the selected template.
4. **Queue**: check, cancel or reschedule what will go out.
5. The scheduler runs every minute and sends due emails, up to the daily limit, with a random 30–120 s gap between sends. Every hour it checks Gmail threads for replies:
   - If a professor replied, they are marked **REPLIED** and their pending follow-ups are cancelled.
   - If there is no reply after `followUpAfterDays`, a follow-up is scheduled in the **same Gmail thread** ("Re: …").
6. **Sent / Professors**: view history and each professor's thread. You can also mark professors INTERESTED or DECLINED manually.

## 7. Switching DRY_RUN off

1. Connect Gmail (step 4) and use **Send test email** on the Gmail page. It goes to `TEST_RECIPIENT` only.
2. Review `/queue` carefully. Anything scheduled in the past is sent on the next minute.
3. In `api/.env` set `DRY_RUN=false` and restart the API. The header's "DRY RUN" badge disappears.

To stop sending at any time, set `DRY_RUN=true` and restart, or set `SCHEDULER_ENABLED=false`.

## Useful commands

```powershell
cd api
npm run typecheck        # tsc --noEmit
npx prisma studio        # browse the DB
npx prisma migrate dev   # after editing prisma/schema.prisma
```
