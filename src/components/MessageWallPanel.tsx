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
// Tailwind v4 migration: the panel's outer/positioning styles are now
// utility classes. The inner-element overrides (.wall-frame, .wall-item,
// etc.) are intentionally kept as a small scoped <style> block — they
// target MessageWall's internal classes, which won't be refactored to
// accept a `variant` prop until Phase 2.2.
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
      )}
    >
      <div className="flex flex-none flex-col border-0 bg-transparent p-0 shadow-none outline-none [&>*]:w-full">
        <MessageWall messages={messages} speedSeconds={speedSeconds} height={360} />
      </div>

      <style>{`
        /* Inner MessageWall frame: strip all glass-panel chrome. */
        .wall-panel .wall-frame {
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: none !important;
          border-radius: 0;
          height: 360px;
          min-height: 0;
          padding: 0;
          box-shadow: none;
        }
        .wall-panel .wall-track {
          padding: 4px 0;
          gap: 12px;
        }

        /* Hide the scroll fade gradients — they are decorative chrome. */
        .wall-panel .wall-fade { display: none !important; }

        /* Wall items: strip backgrounds, borders, border-left accent, radius.
           Keep only the text content visible. Text is right-aligned so the
           feed reads flush against the right rail. */
        .wall-panel .wall-item {
          display: block;
          padding: 4px 0;
          background: transparent !important;
          border: none !important;
          border-left: none !important;
          border-radius: 0;
          box-shadow: none;
          gap: 0;
          text-align: right;
        }
        .wall-panel .wall-item:hover {
          background: transparent !important;
          border-color: transparent !important;
        }
        /* Hide the avatar — only the message text is shown. */
        .wall-panel .wall-avatar { display: none; }
        .wall-panel .wall-body { width: 100%; }
        .wall-panel .wall-head {
          margin-bottom: 2px;
          /* Push author + time to the right edge of the message block. */
          justify-content: flex-end;
        }
        .wall-panel .wall-author {
          color: var(--neon-cyan);
          text-shadow: 0 0 6px rgba(0, 240, 255, 0.35);
        }
        .wall-panel .wall-time { color: var(--text-dim); }
        .wall-panel .wall-text {
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.5;
          text-align: right;
        }

        /* Empty state: drop the glass-panel chrome and hide the dot.
           Text is right-aligned to match the rest of the feed. */
        .wall-panel .wall-empty {
          background: transparent !important;
          border: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow: none;
          text-align: right;
        }
        .wall-panel .wall-empty-dot { display: none; }
      `}</style>
    </aside>
  );
}
