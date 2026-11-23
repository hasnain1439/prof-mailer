// Vercel Function entry. If the app fails to start (usually a missing or invalid environment
// variable), answer with the reason instead of crashing, so it is visible without opening the logs.
// Only configuration messages are shown; anything else stays in the function logs.
const CONFIG_ERROR = /environment variable|ENCRYPTION_KEY|CRON_SECRET|PUBLIC_URL|System mail|DATABASE_URL|DIRECT_URL/i;

let handler;
try {
  ({ app: handler } = await import("../dist/app.js"));
} catch (err) {
  console.error("API failed to start:", err);
  const message = err instanceof Error ? err.message : String(err);
  const reason = CONFIG_ERROR.test(message) ? message : "Startup failed; see the function logs on Vercel";
  handler = (_req, res) => {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { code: "STARTUP_FAILED", message: reason } }));
  };
}

export default handler;
