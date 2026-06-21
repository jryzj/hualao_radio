"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Keeps the device screen on while `isPlaying` is true. Uses the standard
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
// (no gesture, document not focused, etc.), we surface a `failed`
// status via `useState` and log to `console.warn` — audio keeps
// playing (MediaSession), the screen just times out normally.
//
// Older iOS Safari (< 16.4) does not support Wake Lock. The page
// keeps audio playing in the background via MediaSession; the
// background <video> element in src/app/page.tsx (a 2x2 canvas
// captureStream on a muted <video>) is the parallel keepalive for
// the browser's "active media" signal — it works whether or not
// Wake Lock API is available, so it covers cases where Wake Lock
// is missing entirely (some Android Edge / WebView builds).
//
// Structure borrowed verbatim from the simple working version at
// commit bc64155 (one `useEffect` keyed on `[isPlaying]`, with the
// `cancelled` flag closing over the effect lifetime and a guaranteed
// `release()` in cleanup). Tested working on Android Chrome by the
// original author — do NOT split into multiple effects or replace
// the `cancelled` flag with a ref-based equivalent; both moves
// regressed Android wake-on-play (verified June 2026).
//
// `refresh()` (added 2026-06): exposes a manual re-acquire trigger
// for callers that need to force a Wake Lock attempt outside the
// normal visibility transitions (e.g. iOS PWA background→foreground
// `resume` events that don't raise `visibilitychange`). It calls
// the LATEST `acquire` closure via a ref so the single-useEffect +
// `cancelled` structure stays intact. Do not move the `acquire`
// definition outside the effect — its closure must capture the
// per-run `cancelled` flag.

export type WakeLockStatus =
  | { state: "idle" }
  | { state: "active" }
  | { state: "failed"; error: string }
  | { state: "unsupported" };

function detectSupport(): boolean {
  const hasNav = typeof navigator !== "undefined";
  const hasApi = hasNav && "wakeLock" in navigator;
   
  console.log(
    "[wake-lock] detectSupport:",
    hasApi,
    "navigator:",
    hasNav,
    "navigator.wakeLock type:",
    hasNav ? typeof (navigator as Navigator & { wakeLock?: unknown }).wakeLock : "n/a",
  );
  return hasApi;
}

export function useWakeLock(
  isPlaying: boolean,
): { status: WakeLockStatus; refresh: () => void } {
  const [status, setStatus] = useState<WakeLockStatus>(() =>
    detectSupport() ? { state: "idle" } : { state: "unsupported" },
  );
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  // Holds the LATEST `acquire` closure from the active effect run.
  // `refresh()` reads this to force a re-acquire attempt from
  // outside the hook (page-lifecycle `resume` event, manual retry).
  // Each effect run assigns a fresh `acquire` here and nulls it in
  // cleanup, so refresh() always invokes the closure whose
  // `cancelled` flag is still in scope for the current effect.
  const acquireRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
     
    console.log("[wake-lock] effect run, isPlaying:", isPlaying);

    const acquire = async () => {
      if (sentinelRef.current) {

        console.log("[wake-lock] acquire: skip (sentinel exists)");
        return;
      }
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {

        console.log("[wake-lock] acquire: skip (no API)");
        return;
      }
      // Acquire timeout: in some Android Chrome + WebView combos the
      // `request()` Promise genuinely hangs forever when the page
      // loses fully-active state mid-await (notification shade
      // pulled down, status-bar tap, screen about to time out, etc.)
      // instead of rejecting with NotAllowedError. Without a timeout
      // the user sees "正在请求屏幕常亮" indefinitely. We surface a
      // `failed` status at 5s but do NOT cancel the underlying
      // request — if it later resolves, the assignment below will
      // overwrite `failed` with `active` and the pill flips back.
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      timeoutId = setTimeout(() => {
        if (!settled && !sentinelRef.current) {

          console.warn("[wake-lock] request() timed out after 5s");
          setStatus({
            state: "failed",
            error: "Wake Lock request timed out (5s) — page may have lost fully-active state",
          });
        }
      }, 5000);
      try {

        console.log("[wake-lock] acquire: requesting sentinel...");
        const s = await navigator.wakeLock.request("screen");
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);

        console.log(
          "[wake-lock] acquire: sentinel received, cancelled:",
          cancelled,
        );
        if (cancelled) {
          s.release().catch(() => {});
          return;
        }
        sentinelRef.current = s;
        setStatus({ state: "active" });

        console.log("[wake-lock] acquire: status -> active");
        s.addEventListener("release", () => {
          if (sentinelRef.current === s) sentinelRef.current = null;

          console.log("[wake-lock] sentinel released by browser");
        });
      } catch (err) {
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);

        console.warn("[wake-lock] request() failed:", err);
        setStatus({
          state: "failed",
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
      }
    };
      // Expose the just-defined acquire to refresh(). Must run after
      // the `const acquire = ...` statement; placing it before
      // release() keeps the "latest closure wins" semantics in scope
      // for the rest of this effect run.
      acquireRef.current = acquire;

    const release = () => {
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
      setStatus({ state: "idle" });
       
      console.log("[wake-lock] release() called, status -> idle");
    };

    if (isPlaying) {
      acquire();
    } else {
      release();
    }

    const onVis = () => {
       
      console.log(
        "[wake-lock] visibilitychange:",
        document.visibilityState,
        "isPlaying:",
        isPlaying,
      );
      if (document.visibilityState === "visible" && isPlaying) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
       
      console.log(
        "[wake-lock] effect cleanup, isPlaying was:",
        isPlaying,
        "cancelled -> true",
      );
      cancelled = true;
      // Drop the stale ref so refresh() doesn't accidentally call
      // an `acquire` whose `cancelled` is already true. The next
      // effect run will assign a fresh closure here.
      acquireRef.current = null;
      document.removeEventListener("visibilitychange", onVis);
      release();
    };
  }, [isPlaying]);

  // Manual re-acquire trigger. Callers should only invoke this when
  // they have reason to believe the browser released the sentinel
  // (e.g. iOS PWA `resume` event without a corresponding
  // `visibilitychange`). Safe to call when Wake Lock is unsupported
  // (becomes a no-op) or when no effect is active (acquireRef is
  // null). Does NOT touch `isPlaying` — the hook's own effect is
  // still the source of truth for acquire/release on state changes.
  const refresh = useCallback(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }
    acquireRef.current?.();
  }, []);

  return { status, refresh };
}
