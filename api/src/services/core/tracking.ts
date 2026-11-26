/**
 * Open tracking (opt-in per template/email, HTML emails only). The pixel URL goes through the web's
 * /api rewrite to GET /t/o/:token. Opens are approximate: Gmail proxies and may prefetch images,
 * many clients block images, and opening the email in your own Sent folder can count too.
 */
import { env } from "../../lib/env.js";

export function trackingPixelUrl(token: string): string {
  return `${env.PUBLIC_URL}/api/t/o/${encodeURIComponent(token)}.gif`;
}

/** Insert the 1x1 pixel before </body> (or append it). */
export function withTrackingPixel(html: string, token: string): string {
  const img = `<img src="${trackingPixelUrl(token)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
  const i = html.search(/<\/body\s*>/i);
  return i === -1 ? `${html}${img}` : `${html.slice(0, i)}${img}${html.slice(i)}`;
}

/** Transparent 1x1 GIF. */
export const PIXEL_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
