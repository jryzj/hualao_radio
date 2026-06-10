"use client";
import { useEffect, useRef } from "react";
import { MessageWall, type WallMessage } from "./MessageWall";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onToggle: () => void;
  messages: WallMessage[];
  speedSeconds?: number;
}

// Floating message-wall container. Three layout regimes that depend on
// available screen real estate:
//
//   small screens (xs / sm — phones, portrait, e.g. iPhone 7 375×667):
//     Bottom-sheet style, full-width minus gutters, anchored just
//     above the FAB stack. iPhone 7 has the FAB stack at bottom-3
//     (12px) with two 44×44 buttons + 10px gap = 110px tall, so the
//     panel sits at `bottom-[120px]` (110 + 10 margin). The previous
//     `bottom-14` placed the panel ON TOP of the FAB stack — the
//     `z-50` FAB couldn't be tapped to close the panel, and the
//     panel's top edge reached up to y=311 on a 667px screen,
//     covering the volume slider in the RadioPlayer card at y≈325.
//     iPhone X+ devices with the home-indicator notch raise the FAB
//     to bottom-[max(14px,env(safe-area-inset-bottom))]+44+10+44;
//     the calc(...) below uses env() to keep the panel clear on
//     those devices too.
//
//   wide screens (md+ — tablets, desktop):
//     Right-rail floating card, vertically centered, max height
//     constrained to viewport-32. Preserved for desktop/tablet
//     where there's enough horizontal space to fit the panel
//     alongside the RadioPlayer.
//
//   landscape short (height ≤ 500, width wide):
//     Re-anchored to the TOP-RIGHT, capped at 200/170px tall.
//     Keeps the panel from colliding with the bottom-right FAB
//     stack on a phone in landscape.
//
// The panel includes a built-in × close button in its header on small
// screens (where the FAB is covered), so the user always has an
// in-panel close affordance regardless of FAB visibility. The × is
// hidden on md+ where the FAB ✕ toggle remains accessible.
export function MessageWallPanel({ open, onToggle, messages, speedSeconds = 80 }: Props) {
  const panelRef = useRef<HTMLElement>(null);

  // Escape to close. Initial focus moves to the panel itself since
  // there is no header / close button on desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  // Per-state transform:
  //   closed (mobile): slide DOWN off-screen, hidden
  //   closed (md+):   slide RIGHT off-screen, hidden
  //   open:            in place
  // The `md:translate-x-0` / `md:translate-y-0` reset the mobile
  // `translate-y-full` so the panel settles at the right rail's
  // natural position on tablet/desktop.
  const transitionStyle: React.CSSProperties = {
    transition: open
      ? "transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0s"
      : "transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0.35s",
  };

  return (
    <>
      {/* === Backdrop (mobile only) ===============================
          Tappable full-screen overlay behind the panel. Tapping it
          closes the panel — gives the user a clear "modal" affordance
          even when the FABs are covered by the panel itself. On
          md+ the right-rail panel never covers the FABs, so the
          backdrop is suppressed via `md:hidden`.

          NOTE: removed `backdrop-blur` from this layer. iOS 15.8
          Safari has a known quirk where fixed-position elements with
          backdrop-filter (a GPU compositor hint) sometimes intercept
          touch events and pass them to the wrong target — the
          "click goes to backdrop but backdrop's onClick is somehow
          the panel's onClick" symptom. Plain `bg-black/30` is
          visually adequate on small screens and reliably clickable
          on every Safari version we support. */}
      {open && (
        <button
          type="button"
          aria-label="Close message panel"
          onClick={onToggle}
          tabIndex={-1}
          className={cn(
            "fixed inset-0 z-[55] cursor-default bg-black/30 md:hidden",
            "animate-[fade-in_0.2s_var(--ease-out)_forwards]",
          )}
        />
      )}

      <aside
        ref={panelRef}
        role="complementary"
        tabIndex={-1}
        aria-label="Live audience messages"
        aria-hidden={!open}
        style={transitionStyle}
        className={cn(
          // === Small-screen (mobile portrait) bottom sheet =============
          // Position the panel just above the FAB stack so the FABs
          // remain visible. FAB stack on iPhone 7 (no safe-area) is at
          // bottom-3 (12px) with two 44×44 buttons + 10px gap (98px)
          // = 110px tall; on iPhone X+ env(safe-area-inset-bottom)
          // adds another ~34px, raising the stack to ~144px. The
          // calc() below accounts for both.
          //
          // `bottom-[calc(120px+env(safe-area-inset-bottom,0px))]`
          // would be ideal but Tailwind arbitrary values can't easily
          // compose with env(). Instead we use a slightly larger
          // fixed value (`bottom-[140px]`) that clears both cases
          // with ~10-15px breathing room, and rely on the
          // `landscape-*` variants below to override on phone
          // landscape (where the panel re-anchors to top-right).
          "fixed inset-x-3 bottom-[140px] z-[60] flex max-h-[40vh] flex-col overflow-hidden rounded-[14px] border-0 bg-transparent p-0 opacity-0 shadow-none backdrop-blur-none",
          // Closed state: hidden + slid below the bottom edge
          !open && "pointer-events-none invisible translate-y-full",
          // Open state: visible + settled
          open && "pointer-events-auto visible translate-y-0 opacity-100",
          // === Tablet portrait (md) and up: switch to right-rail card ===
          // Keep the original 260-300px wide floating card. Reset the
          // mobile translate-y so the right-rail positioning wins.
          "sm:right-4 sm:bottom-[140px] sm:left-auto sm:max-h-[50vh] sm:w-[280px] sm:translate-y-0",
          "md:bottom-auto md:left-auto md:top-1/2 md:max-h-[calc(100vh-32px)] md:w-[300px] md:-translate-y-1/2",
          // Right-rail closed state at md+ (slid off the right edge)
          !open && "md:translate-x-[120%] md:translate-y-[-50%]",
          // Open state at md+: settled in place
          open && "md:translate-x-0 md:translate-y-[-50%] md:opacity-100",
          "lg:right-7 lg:w-[320px]",
          "3xl:right-9 3xl:w-[360px]",
          // === Phone landscape: anchor to top-right, cap height ======
          // Phone landscape is short (≤500 tall) and the right-rail
          // card collides with the bottom FAB stack. Move it to the
          // top-right and cap it. Mobile translate-y stays overridden
          // (no off-screen-slide needed; we just clamp the position).
          "landscape-short:inset-x-auto landscape-short:right-2.5 landscape-short:left-auto landscape-short:top-3 landscape-short:bottom-auto landscape-short:max-h-[200px] landscape-short:w-[260px] landscape-short:translate-y-0 landscape-short:rounded-[10px]",
          "landscape-shorter:top-2.5 landscape-shorter:max-h-[170px] landscape-shorter:translate-y-0",
        )}
      >
        {/* === In-panel header — REMOVED for fully transparent panel ===
            The FAB stack is no longer covered by the panel on mobile
            (the panel itself is now fully transparent / no chrome),
            and the backdrop is still tappable to close, so an
            in-panel close button is no longer needed. The label
            and × button are intentionally absent here. */}

        <div className="flex flex-none flex-col border-0 bg-transparent p-0 shadow-none outline-none [&>*]:w-full">
          <MessageWall messages={messages} speedSeconds={speedSeconds} height={250} variant="panel" />
        </div>
      </aside>
    </>
  );
}
