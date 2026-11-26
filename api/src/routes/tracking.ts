/** Public open-tracking pixel: GET /t/o/:token(.gif). Always answers the GIF; records the open if the token exists. */
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { PIXEL_GIF } from "../services/core/tracking.js";

export const trackingRouter = Router();

trackingRouter.get("/o/:token", async (req, res) => {
  const token = String(req.params.token).replace(/\.gif$/i, "");
  if (/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    const now = new Date();
    try {
      await prisma.$executeRaw`UPDATE "Email" SET "openCount" = "openCount" + 1, "openedAt" = COALESCE("openedAt", ${now}) WHERE "openToken" = ${token}`;
    } catch (err) {
      console.error(`[tracking] open not recorded: ${(err as Error).name}`);
    }
  }
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Content-Length", String(PIXEL_GIF.length));
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.end(PIXEL_GIF);
});
