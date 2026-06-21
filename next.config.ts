import type { NextConfig } from "next";


const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    // CSP: tight by default. The listener UI loads Google Fonts via
    // <link> (see src/app/layout.tsx) and Cloudflare's Web Analytics
    // beacon is auto-injected by Cloudflare when enabled in the
    // dashboard — both are explicitly allowlisted below.
    // In development we also add 'unsafe-eval' to script-src because
    // React 19 dev mode uses eval() to reconstruct callstacks from
    // bundled frames; it is never needed in production.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Cloudflare Web Analytics beacon: cloudflareinsights.com.
      // NOTE: 'unsafe-inline' is included in BOTH dev and prod. This is
      // known to be over-permissive (security review 2026-06-06, finding
      // M4). The proper fix is a per-request nonce in production, which
      // requires Next.js's nonce-aware header helper. Left as-is because
      // it interacts with the deployed CSP report and changing it is a
      // coordinated prod cutover, not a quiet code edit.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://static.cloudflareinsights.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: data:",
      // ws:/wss: for the WebSocket fan-out server (page uses wss when
      // loaded over HTTPS, ws in plain HTTP dev). cloudflareinsights.com
      // is the beacon's reporting endpoint.
      "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:* https://cloudflareinsights.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Next.js 16 blocks cross-origin requests to dev-only assets/endpoints
  // unless the origin is explicitly allowed. Desktop dev usually uses
  // localhost, but real phones hit the machine over LAN IP
  // (for example 192.168.x.x), so client hydration can fail and every
  // button appears "dead" unless we allow the common private subnets.
  //
  // This only affects `next dev`; production builds ignore it.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
  // Native modules (libsql ships a .node binding) must NOT be bundled
  // by Turbopack. When they are, build-time "Collecting page data"
  // workers try to require the hash-bundled external module on Windows
  // and fail with "Failed to load external module @libsql/client-…",
  // cascading into Zone OOM across the 19 worker processes. Keeping
  // these as Node-resolved externals makes `next build` match `next
  // dev` behavior for the DB layer.
  serverExternalPackages: [
    "@libsql/client",
    "@prisma/adapter-libsql",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
