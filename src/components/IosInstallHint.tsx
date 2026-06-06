"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "ios-install-hint-dismissed";

// iOS Safari in non-standalone mode kills background audio the moment
// the screen locks. The only way to keep audio alive across a lock is
// to install the page as a PWA via "Add to Home Screen". This banner
// nudges the user toward that, but only on iOS, only when not yet
// installed, only when audio is actually playing (so the suggestion
// is contextual), and only once per device (localStorage).
export function IosInstallHint({ isPlaying }: { isPlaying: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ reports as Mac unless a touch capability is detectable.
      (ua.includes("Mac") && "ontouchend" in document);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS legacy field still set when launched from home screen icon.
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    if (isIOS && !isStandalone && !dismissed && isPlaying) {
      setShow(true);
    }
  }, [isPlaying]);

  if (!show) return null;

  return (
    <div
      role="status"
      className="fixed left-3 right-3 z-[60] flex items-center gap-3 rounded-[10px] border border-[rgba(140,160,255,0.3)] bg-[rgba(13,13,24,0.92)] px-3.5 py-2.5 text-sm leading-[1.4] text-[#e0e2ff] backdrop-blur-[8px] pointer-events-auto top-[max(12px,env(safe-area-inset-top,12px))] md:left-1/2 md:right-auto md:max-w-[540px] md:-translate-x-1/2"
    >
      <span>
        要在锁屏后继续收听，请点<span aria-hidden>分享</span>按钮 → <b>添加到主屏幕</b>。
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
