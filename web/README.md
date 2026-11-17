# prof-mailer web

Next.js (App Router) + Tailwind UI for prof-mailer. Talks to the API at `NEXT_PUBLIC_API_URL`
(default `http://localhost:4000/api`; copy `.env.example` to `.env.local` to change it).

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
npm run lint
npm run typecheck
```

All timestamps from the API are UTC; the UI always displays and accepts times in Asia/Karachi (PKT, UTC+5).
