"use client";
import { useEffect, useRef } from "react";

// Keeps the screen on while `isPlaying` is true. Uses the standard
// Wake Lock API where supported — Chrome 84+, Edge 84+, Firefox 126+,
// Safari 16.4+, Samsung Internet 14+.
//
// The browser releases the lock automatically when the page is
// hidden, so we re-acquire on `visibilitychange` when the page
// returns to foreground and audio is still playing.
//
// Note: the first `request()` on a page must happen in the context
// of a user gesture. We trigger it from a useEffect that fires when
// isPlaying flips true, and that flip is itself caused by the user's
// PLAY click (or EnterOverlay tap), so the gesture context is
// usually still valid. If the browser rejects the request anyway
// (no gesture, document not focused, etc.), we silently degrade —
// audio keeps playing, the screen just times out normally.
//
// Older iOS Safari (< 16.4) does not support Wake Lock. We do NOT
// fall back to a silent <video> element here: the workaround is
// fragile across iOS versions and can show a "playing" indicator
// in the status bar. The user can still hear audio in the
// background (via MediaSession from the previous fix); the screen
// just times out on devices that predate Wake Lock support.
export function useWakeLock(isPlaying: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let cancelled = false;

    const acquire = async () => {
      if (sentinelRef.current) return;
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          s.release().catch(() => {});
          return;
        }
        sentinelRef.current = s;
        s.addEventListener("release", () => {
          if (sentinelRef.current === s) sentinelRef.current = null;
        });
      } catch {
        // Permission denied, no user gesture, etc. Silent fallback.
      }
    };

    const release = () => {
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };

    if (isPlaying) {
      acquire();
    } else {
      release();
    }

    const onVis = () => {
      if (document.visibilityState === "visible" && isPlaying) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      release();
    };
  }, [isPlaying]);
}
