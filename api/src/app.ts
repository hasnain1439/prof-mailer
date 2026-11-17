import express from "express";
import cors from "cors";
import { attachUser } from "./lib/auth.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { csrfGuard, isAllowedOrigin } from "./middleware/security.js";

export const app = express();

// Render (and the Vercel rewrite in front of it) terminate TLS; trust the first proxy hop for req.ip / secure.
app.set("trust proxy", 1);
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
