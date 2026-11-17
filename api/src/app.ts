import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { attachUser } from "./lib/auth.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { csrfGuard, isAllowedOrigin } from "./middleware/security.js";

export const app = express();

// Render (and the Vercel rewrite in front of it) terminate TLS; trust the first proxy hop for req.ip / secure.
// Number of proxy hops in front of the API, so req.ip is the real client (rate limits are per IP).
// 1 everywhere: req.ip = the address that reached this server (Render appends it). The real browser IP
// arrives from the web proxy via x-pm-client-ip + API_PROXY_SECRET (see clientIp in middleware/security.ts).
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.disable("x-powered-by");

// The browser normally reaches the API same-origin through the Next.js /api rewrite; CORS is a fallback.
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
    credentials: true,
  }),
);
app.use("/api", csrfGuard);
app.use(express.json({ limit: "5mb" }));
app.use("/api", attachUser);

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);
