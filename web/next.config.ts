import type { NextConfig } from "next";

/**
 * Where the Express API lives. The browser only ever talks to this web origin; `/api/*` is proxied
 * server-side, so the session cookie is first-party. Read when the config loads (`next dev` start or
 * `next build`), so set API_ORIGIN at build time in production.
 */
const API_ORIGIN = (process.env.API_ORIGIN || "http://localhost:4100").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
