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
      "media-src 'self' blob:",
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
  // Next.js 16 blocks cross-origin dev resources by default. Allow
  // 127.0.0.1 alongside localhost so the listener/admin UI works
  // whether the developer types either host into the address bar.
  // Only affects `next dev`; production builds ignore this.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
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