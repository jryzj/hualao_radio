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




// Floating right-side panel that hosts the scrolling message wall.
// Pure text only: no header, no borders, no backgrounds, no cards. The
// message text + author + time are the only visible elements; everything
// else is transparent. Closing is via the FAB or the Escape key.
//
// Tailwind v4 migration: the panel passes `variant="panel"` to
// MessageWall, which strips all glass-panel chrome and right-aligns the
// text. The previously-dead inline <style> block (which targeted
// non-existent .wall-frame / .wall-item / .wall-text classes) is gone.
export function MessageWallPanel({ open, onToggle, messages, speedSeconds = 80 }: Props) {
  const panelRef = useRef<HTMLElement>(null);

  // Escape to close. Initial focus moves to the panel itself since there is
  // no header / close button (the panel is text-only).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  // The original CSS uses different transitions for transform/opacity
  // (0.35s/0.25s) and a delayed visibility change (0s linear 0.35s on
  // close, no delay on open). Tailwind's `transition` utility can't
  // express per-property timing + delays cleanly, so the timing lives
  // in an inline style. The className handles everything else.
  const transitionStyle: React.CSSProperties = {
    transition: open
      ? "transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0s"
      : "transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0.35s",
    transform: open ? "translate(0, -50%)" : "translate(120%, -50%)",
  };

  return (
    <aside
      ref={panelRef}
      role="complementary"
      tabIndex={-1}
      aria-label="Live audience messages"
      aria-hidden={!open}
      style={transitionStyle}
      className={cn(
        // Base positioning + transparency (text-only panel)
        "fixed top-1/2 right-3 left-auto bottom-auto z-[60] flex w-[260px] flex-col overflow-hidden border-0 bg-transparent p-0 opacity-0 shadow-none outline-none backdrop-filter-none",
        // Closed state: slide off-right + hide
        !open && "pointer-events-none invisible",
        // Open state: visible + slide in
        open && "pointer-events-auto visible opacity-100",
        // Responsive width/inset — sm=480, md=768, lg=1024, 3xl=1366
        "sm:right-4 sm:w-[280px]",
        "md:right-5 md:w-[300px] md:max-h-[calc(100vh-32px)]",
        "lg:right-7 lg:w-[320px]",
        "3xl:right-9 3xl:w-[360px]",
        // Landscape short — re-anchor to the right edge, centered in the
        // vertical space ABOVE the bottom-right FAB stack (rather than
        // pinned to the top, which felt visually "too high" and left
        // an awkward empty band between the panel and the FAB).
        //
        // Geometry: the FAB container sits at `bottom-[14px]` with two
        // 44px buttons in a single row, so the top of the FAB stack is
        // at `视口高 - 58px` from the viewport top. We want the panel's
        // vertical CENTER at the midpoint of (0, FAB_top), which is
        // `(视口高 - 58) / 2 = 50% - 29px` in CSS. The inline
        // `translate(0, -50%)` in transitionStyle makes the panel's
        // center land at the `top` value, so this calc directly
        // positions the center. Result: the panel is symmetrically
        // placed between the top edge and the FAB, and the formula
        // adapts to any landscape viewport height in [360, 500].
        //
        // Why same formula for both landscape-short and
        // landscape-shorter: the FAB position is identical (it's at
        // the bottom of the viewport, not the panel's), and the
        // `-50%` Y translation adapts to whatever panel height the
        // `max-h` cap allows (200 vs 170) — the visual center stays
        // at the same `top` value either way.
        "landscape-short:top-[calc(50%-29px)] landscape-short:bottom-auto landscape-short:max-h-[200px]",
        "landscape-shorter:top-[calc(50%-29px)] landscape-shorter:bottom-auto landscape-shorter:max-h-[170px]",
      )}
    >
      <div className="flex flex-none flex-col border-0 bg-transparent p-0 shadow-none outline-none [&>*]:w-full">
        <MessageWall messages={messages} speedSeconds={speedSeconds} height={250} variant="panel" />
      </div>
    </aside>
  );
}
