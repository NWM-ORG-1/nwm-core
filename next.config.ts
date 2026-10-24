import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  poweredByHeader: false,
  // article share images (src/app/(site)/a/[slug]/opengraph-image.tsx) render new articles at runtime
  outputFileTracingIncludes: {
    "/a/**": ["./node_modules/pretendard/dist/public/static/Pretendard-Black.otf", "./node_modules/pretendard/dist/public/static/Pretendard-Bold.otf"],
  },

  /**
   * Cache lifetimes (seconds). `stale` stays ≥ 300 so cached list data is part of
   * the prefetched App Shell; freshness for readers comes from /api/pulse and
   * on-demand tag invalidation when the newsroom publishes.
   */
  cacheLife: {
    river: { stale: 300, revalidate: 60, expire: 86_400 },
    article: { stale: 300, revalidate: 1_800, expire: 604_800 },
    reference: { stale: 3_600, revalidate: 21_600, expire: 2_592_000 },
    pulse: { stale: 30, revalidate: 30, expire: 300 },
  },

  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // `next dev` only: the dev MCP server appends to .next/dev/logs/next-development.log on
    // every request, Turbopack takes the write for a change, and open pages reload in a loop
    // (75–110 reloads per 20 s measured on the newsroom; 2 with this off)
    mcpServer: false,
  },

  turbopack: {
    rules: {
      "*.css": {
        // Only our own stylesheets go through Tailwind; node_modules CSS (Pretendard) is left alone.
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // versioned, content-stable font files
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
