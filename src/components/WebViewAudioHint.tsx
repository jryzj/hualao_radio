"use client";
import { useEffect, useState } from "react";
import { parseEnvironment } from "@/lib/ua-parser";

const STORAGE_KEY = "webview-audio-hint-dismissed";

// In-app WebViews (WeChat, QQ, generic Android wv, iOS WKWebView) don't
// honor Wake Lock, have partial MediaSession, and the host OS kills their
// audio the moment the screen locks. We can't fix this from the web
// layer — the only escape is "open in browser". This banner nudges the
// user in that direction.
//
// Gated on:
//   - detected WebView UA (parseEnvironment().isWebView)
//   - not already installed as a standalone PWA
//   - audio is actually playing (so the suggestion is contextual)
//   - user hasn't already dismissed it on this device
//
// Coexists with IosInstallHint: both can theoretically render on iOS
// WeChat. We give this banner `z-[61]` so it sits above the iOS install
// hint's `z-[60]` when both apply — the "open in browser" guidance is
// the more urgent action in a WebView, where PWA install isn't even
// possible.
export function WebViewAudioHint({ isPlaying }: { isPlaying: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // The mounted-via-effect gate below mirrors the pattern in
    // IosInstallHint and WakeLockIndicator: there is no equivalent
    // pre-hydration API to read window.matchMedia / localStorage,
    // so we cannot initialise `show` directly in useState without
    // an SSR/CSR mismatch. The lint rule is suppressed locally for
    // the same reason as those siblings.
    const env = parseEnvironment();
    const dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    if (env.isWebView && !env.isStandalone && isPlaying && !dismissed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(true);
    }
  }, [isPlaying]);

  if (!show) return null;

  return (
    <div
      role="status"
      className="fixed left-3 right-3 z-[61] flex items-center gap-3 rounded-[10px] border border-[rgba(140,160,255,0.3)] bg-[rgba(13,13,24,0.92)] px-3.5 py-2.5 text-sm leading-[1.4] text-[#e0e2ff] backdrop-blur-[8px] pointer-events-auto top-[max(12px,env(safe-area-inset-top,12px))] md:left-1/2 md:right-auto md:max-w-[540px] md:-translate-x-1/2"
    >
      <span>
        当前浏览器内核<span aria-hidden>·</span><b>无法在锁屏后继续播放</b>。请点右上角菜单 → 用浏览器打开。
      </span>
      <button
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, "1");
          setShow(false);
        }}
        aria-label="关闭提示"
        className="ml-auto cursor-pointer border-0 bg-transparent p-1 px-2 text-[20px] leading-none text-inherit"
      >
        ×
      </button>
    </div>
  );
}