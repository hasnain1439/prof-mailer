import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Runs before the /api/* rewrite to the Express API. It tells the API the real browser IP (for rate
 * limits) in a header the API only trusts when it comes with API_PROXY_SECRET, so clients can't spoof
 * their IP with X-Forwarded-For. Any x-pm-* headers sent by the browser are dropped.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("x-pm-client-ip");
  headers.delete("x-pm-proxy-secret");

  const secret = process.env.API_PROXY_SECRET;
  // On Vercel, x-real-ip / x-forwarded-for are set by Vercel's edge (client values are overwritten).
  // Elsewhere (local dev) these headers come from the client, so don't vouch for them.
  if (secret && process.env.VERCEL === "1") {
    const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) {
      headers.set("x-pm-client-ip", ip);
      headers.set("x-pm-proxy-secret", secret);
    }
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
