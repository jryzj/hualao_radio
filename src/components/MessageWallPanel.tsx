"use client";
import { useEffect, useRef } from "react";
import { MessageWall, type WallMessage } from "./MessageWall";

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

  return (
    <aside
      ref={panelRef}
      className={`wall-panel ${open ? "open" : ""}`}
      role="complementary"
      tabIndex={-1}
      aria-label="Live audience messages"
      aria-hidden={!open}
    >
      <div className="wall-panel-body">
        <MessageWall messages={messages} speedSeconds={speedSeconds} height={360} />
      </div>

      <style>{`
        .wall-panel {
          position: fixed;
          z-index: 60;
          background: transparent;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          /* Defensive: no border / outline / shadow in any state. */
          border: none;
          outline: none;
          box-shadow: none;

          /* Vertically centered on screen in every viewport. The translateY
             keeps the panel's vertical midpoint at top: 50%. The translateX
             slides it in / out from the right edge. */
          top: 50%;
          left: auto;
          right: 12px;
          bottom: auto;
          width: 260px;
          height: auto;
          max-height: calc(100dvh - 24px);
          padding: 0;
          transform: translate(120%, -50%);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0.35s;
        }
        .wall-panel.open {
          /* translateY stays at -50% so the panel stays vertically centered
             while translateX animates from 120% to 0. */
          transform: translate(0, -50%);
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          border: none;
          outline: none;
          box-shadow: none;
          transition: transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0s;
        }

        /* Larger phones / small tablet portrait: a touch wider, more inset. */
        @media (min-width: 480px) {
          .wall-panel { right: 16px; width: 280px; }
        }

        /* Tablet portrait (>= 768px) */
        @media (min-width: 768px) {
          .wall-panel {
            right: 20px;
            width: 300px;
            max-height: calc(100dvh - 32px);
          }
        }

        /* Tablet landscape / small desktop (>= 1024px) */
        @media (min-width: 1024px) {
          .wall-panel { right: 28px; width: 320px; }
        }

        /* Wide desktop (>= 1366px) */
        @media (min-width: 1366px) {
          .wall-panel { right: 36px; width: 360px; }
        }

        /* Body is just a transparent layout container — no card chrome. */
        .wall-panel-body {
          flex: 0 0 auto;
          display: flex;
          padding: 0;
          background: transparent;
          border: none;
          box-shadow: none;
          outline: none;
        }
        .wall-panel-body > * { width: 100%; }

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
