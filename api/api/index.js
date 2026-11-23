// Vercel entry point: every request is rewritten here (see vercel.json) and handled by the Express app
// compiled by `npm run build` (tsc -> dist/). Local development still uses src/index.ts (app.listen + cron).
import { app } from "../dist/app.js";

export default app;
