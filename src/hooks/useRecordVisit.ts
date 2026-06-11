"use client";
import { useEffect, useRef } from "react";

/**
 * Fires a POST /api/visitors on mount and on every change of `path`,
 * with the navigator-derived hint so the server can record a more
 * complete picture than it can pull from the User-Agent header alone
 * (e.g. the iPadOS-on-Mac model hint, or a model string the UA
 * doesn't expose).
 *
 * Path-keyed dedup: a single path fires once per hook lifetime.
 * When `path` changes (e.g. a layout that uses usePathname) we
 * re-fire, so a user navigating through /admin/topics → /admin/
 * personas produces two rows instead of one.
 *
 * Best-effort: the request is fire-and-forget; a failure is logged
 * but never surfaces to the user. The point of this hook is to add
 * zero friction to page load.
 */
export function useRecordVisit(path?: string) {
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const p = path ?? (typeof window !== "undefined" ? window.location.pathname : "/");
    if (firedRef.current.has(p)) return;
    firedRef.current.add(p);
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent || "";
    const payload: {
      userAgent: string;
      deviceType?: "mobile" | "tablet" | "desktop";
      path: string;
    } = {
      userAgent: ua,
      path: p,
    };

    // Best-effort device type. Matches the server-side logic loosely
    // so the override only happens when the client has stronger
    // evidence (touch + no fine pointer).
    const coarseTouch = typeof navigator !== "undefined" &&
      ("maxTouchPoints" in navigator) &&
      (navigator.maxTouchPoints ?? 0) > 0;
    const coarsePointer = typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: fine)").matches;
    if (coarseTouch && !coarsePointer) {
      payload.deviceType = /ipad|tablet|android(?!.*mobile)/i.test(ua)
        ? "tablet"
        : "mobile";
    }

    try {
      fetch("/api/visitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        // Network or server error — silently ignore. The admin
        // dashboard never depends on this succeeding.
      });
    } catch {
      // ignore
    }
  }, [path]);
}
