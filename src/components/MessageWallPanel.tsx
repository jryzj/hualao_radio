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
        !open && "pointer-events-none invisible translate-x-[120%] -translate-y-1/2",
        // Open state: visible + slide in
        open && "pointer-events-auto visible translate-x-0 -translate-y-1/2 opacity-100",
        // Responsive width/inset — sm=480, md=768, lg=1024, 3xl=1366
        "sm:right-4 sm:w-[280px]",
        "md:right-5 md:w-[300px] md:max-h-[calc(100dvh-32px)]",
        "lg:right-7 lg:w-[320px]",
        "3xl:right-9 3xl:w-[360px]",
        // Landscape short — re-anchor to the TOP-RIGHT and cap height.
        // The default `top-1/2 -translate-y-1/2` centers the panel
        // vertically on the right edge, which collides with the
        // bottom-right FAB stack on phone landscape (360–420h). Moving
        // it to top + removing the vertical centering clears the FAB
        // area while keeping the slide-in-from-right animation.
        "landscape-short:top-3 landscape-short:bottom-auto landscape-short:max-h-[200px] landscape-short:translate-y-0",
        "landscape-shorter:top-2.5 landscape-shorter:bottom-auto landscape-shorter:max-h-[170px] landscape-shorter:translate-y-0",
      )}
    >
      <div className="flex flex-none flex-col border-0 bg-transparent p-0 shadow-none outline-none [&>*]:w-full">
        <MessageWall messages={messages} speedSeconds={speedSeconds} height={250} variant="panel" />
      </div>
    </aside>
  );
}
