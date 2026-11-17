import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.js";

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "5mb" }));

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);
