import { app } from "./app.js";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { startScheduler } from "./jobs/index.js";

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (DRY_RUN=${env.DRY_RUN})`);
  if (env.SCHEDULER_ENABLED) startScheduler();
  if (env.IS_PROD && !env.API_PROXY_SECRET) {
    console.warn("[config] API_PROXY_SECRET is not set: all traffic through the web proxy shares one rate-limit bucket. Set the same value on Render and Vercel.");
  }
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
