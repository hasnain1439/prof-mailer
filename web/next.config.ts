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
  experimental: {
    // Only validate segments that explicitly export `instant`. Every page here is a Client Component
    // behind the client-side AuthGate (AppShell renders a skeleton until /auth/me resolves), so no page
    // segment renders on the server and the default validation reports each one as "dropped from
    // rendering" ("Could not validate that a segment in your UI has instant navigation"). Pages can't
    // export `instant = false` themselves ("use client"), so opt out here instead.
    // See node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md#validate-instant-navigation
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
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
