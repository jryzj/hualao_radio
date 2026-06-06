import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "RadioAI · Live Signal",
  description: "AI-driven cyberpunk radio — live broadcasts, real-time audience signals.",
  applicationName: "RadioAI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#050509",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        {/* Fonts loaded via <link> rather than next/font/google:
            - next/font downloads at build time on the server, which fails in
              networks that cannot reach fonts.googleapis.com (e.g. mainland
              China). A failed build-time fetch leaves a permanent warning in
              dev logs even when the fallback renders fine.
            - <link> loads in the browser, fails silently with fallback fonts,
              and never blocks SSR or dev startup. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@300;400;500;600;700&display=swap"
        />
        {/* Mobile / PWA hints — let the browser treat this as a media app
            and keep audio alive when the screen turns off. iOS Safari
            requires the page to be "Add to Home Screen" for true
            background playback; these metas + the manifest below are
            the prerequisite. Without a manifest, iOS won't recognize
            the page as installable and MediaSession alone won't keep
            audio alive when the screen locks. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RadioAI" />
        <meta name="application-name" content="RadioAI" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
