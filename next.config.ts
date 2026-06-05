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
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Cloudflare Web Analytics beacon: cloudflareinsights.com.
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
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