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
    <div className="ios-install-hint" role="status">
      <span>
        要在锁屏后继续收听，请点<span aria-hidden>分享</span>按钮 → <b>添加到主屏幕</b>。
      </span>
      <button
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, "1");
          setShow(false);
        }}
        aria-label="关闭提示"
      >
        ×
      </button>
    </div>
  );
}
