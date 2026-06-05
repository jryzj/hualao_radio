"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface WallMessage {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

interface Props {
  messages: WallMessage[];
  height?: number;
  speedSeconds?: number; // time for a single message to traverse the frame height
  emptyText?: string;
}

// Vertically-scrolling message wall.
//
// Two layouts depending on whether the message list fills the frame:
//   - listH >= frameH  →  [L, L] duplicated, original continuous marquee.
//   - listH <  frameH  →  [S, L, S, L] with S = frameH between copies.
//                          Items "fly through" the frame: enter from the
//                          bottom, traverse, exit the top, re-enter from
//                          the bottom. Without the spacer the items would
//                          otherwise be pinned to the top portion of the
//                          frame for the entire cycle.
//
// The animation duration is scaled so each message's pixels/sec stays
// constant regardless of whether a spacer is in play.
export function MessageWall({
  messages,
  height,
  speedSeconds = 60,
  emptyText = "no signals yet · waiting for the first transmission",
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [layout, setLayout] = useState<{ listH: number; frameH: number; gap: number }>({ listH: 0, frameH: 0, gap: 6 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Measure the rendered list and frame heights + the track's flex gap.
  // Re-measure when the message count or `height` prop changes so the
  // spacer / duration always match the actual rendered size.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      if (!frameRef.current || !listRef.current) return;
      // The list is a child of the track, so by the time the list is
      // mounted the track is too. Read the track's flex gap so the
      // period matches the rendered spacing exactly.
      const trackEl = trackRef.current;
      if (!trackEl) return;
      const cs = window.getComputedStyle(trackEl);
      const gapPx = parseFloat(cs.rowGap || cs.gap || "0") || 0;
      setLayout({
        listH: listRef.current.offsetHeight,
        frameH: frameRef.current.offsetHeight,
        gap: gapPx,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    if (frameRef.current) ro.observe(frameRef.current);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [messages.length, height]);

  if (messages.length === 0) {
    return (
      <div className="wall-empty glass-panel">
        <span className="wall-empty-dot" />
        <span className="mono">{emptyText}</span>
        <style>{`
          .wall-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 24px;
            color: var(--text-dim);
            font-size: 12px;
            letter-spacing: 0.05em;
          }
          .wall-empty-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--neon-cyan);
            box-shadow: 0 0 8px var(--neon-cyan);
            animation: neon-breathe 1.6s ease-in-out infinite;
          }
        `}</style>
      </div>
    );
  }

  // Render items with stable keys. For seamless loop we render the list twice.
  // Recent messages first (newest at top of the visible area); CSS animation
  // moves the track upward so the oldest items exit the top while new ones
  // appear at the bottom.
  const ordered = [...messages].reverse();
  const list = ordered.map(m => <WallItem key={m.id} message={m} />);

  // Reduced motion = static, scrollable list
  if (reduced) {
    return (
      <div
        className="wall-static glass-panel"
        style={height ? { height, maxHeight: "60vh" } : { minHeight: 200 }}
        role="log"
        aria-label="Live audience messages"
      >
        <div className="wall-static-inner">{list}</div>
        <style>{`
          .wall-static { overflow-y: auto; padding: 12px; }
          .wall-static-inner { display: flex; flex-direction: column; gap: 6px; }
        `}</style>
      </div>
    );
  }

  const { listH, frameH, gap } = layout;
  // Only insert the spacer when the list is too short to fill the frame.
  // Sizing the spacer at exactly frameH guarantees the items fully exit
  // the top before the next copy re-enters from the bottom.
  const needSpacer = listH > 0 && frameH > 0 && listH < frameH;
  const spacerH = needSpacer ? frameH : 0;
  // The track scrolls exactly one content period per cycle so the loop
  // is seamless. Period accounts for the flex gap between children.
  //   [L, L]                → listH + gap
  //   [S, L, S, L]          → spacerH + listH + 2 * gap
  const period = needSpacer ? spacerH + listH + 2 * gap : listH + gap;
  // Keep each message's pixels/sec constant. `speedSeconds` is the
  // time for one message to traverse one frame height, so duration is
  // scaled by (period / frameH).
  const duration = frameH > 0 ? (period / frameH) * speedSeconds : speedSeconds;

  return (
    <div
      ref={frameRef}
      className="wall-frame glass-panel"
      style={height ? { height, maxHeight: "60vh" } : { minHeight: 200 }}
      role="log"
      aria-label="Live audience messages"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="wall-track"
        style={{
          "--wall-distance": `${period}px`,
          animationDuration: `${duration}s`,
          animationPlayState: paused ? "paused" : "running",
        } as React.CSSProperties}
      >
        {spacerH > 0 && <div className="wall-spacer" style={{ height: spacerH }} aria-hidden />}
        <div ref={listRef} className="wall-list">{list}</div>
        {spacerH > 0 && <div className="wall-spacer" style={{ height: spacerH }} aria-hidden />}
        <div className="wall-list">{list}</div>
      </div>

      {/* Top + bottom fade gradients so items dissolve into the frame */}
      <div className="wall-fade top" />
      <div className="wall-fade bottom" />

      <style>{`
        .wall-frame {
          position: relative;
          overflow: hidden;
          padding: 0;
          flex: 1 1 auto;
          min-height: 180px;
        }
        .wall-track {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px;
          will-change: transform;
          animation: wall-scroll linear infinite;
        }
        .wall-list {
          display: flex;
          flex-direction: column;
          gap: inherit;
        }
        .wall-spacer { flex: 0 0 auto; }
        .wall-fade {
          position: absolute;
          left: 0;
          right: 0;
          height: 32px;
          pointer-events: none;
          z-index: 1;
        }
        .wall-fade.top {
          top: 0;
          background: linear-gradient(180deg, var(--bg-glass-strong) 0%, transparent 100%);
        }
        .wall-fade.bottom {
          bottom: 0;
          background: linear-gradient(0deg, var(--bg-glass-strong) 0%, transparent 100%);
        }
      `}</style>
    </div>
  );
}

function WallItem({ message }: { message: WallMessage }) {
  const initial = (message.authorName || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="wall-item">
      <span className="wall-avatar" aria-hidden>{initial}</span>
      <div className="wall-body">
        <div className="wall-head">
          <span className="wall-author display">{message.authorName || "anonymous"}</span>
          <span className="wall-time mono">{formatTime(message.createdAt)}</span>
        </div>
        <p className="wall-text">{message.content}</p>
      </div>

      <style>{`
        .wall-item {
          display: flex;
          gap: 10px;
          padding: 10px 12px;
          background: rgba(0, 240, 255, 0.03);
          border: 1px solid var(--border);
          border-left: 2px solid var(--neon-cyan);
          border-radius: var(--radius-md);
          transition: background 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
        }
        .wall-item:hover {
          background: rgba(0, 240, 255, 0.06);
          border-color: var(--border-strong);
        }
        .wall-avatar {
          flex: 0 0 28px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--neon-violet), var(--neon-cyan));
          color: var(--bg-deep);
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-transform: uppercase;
          box-shadow: 0 0 8px rgba(0, 240, 255, 0.3);
        }
        .wall-body {
          flex: 1 1 auto;
          min-width: 0;
        }
        .wall-head {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 2px;
        }
        .wall-author {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: var(--neon-cyan);
          text-transform: uppercase;
        }
        .wall-time {
          font-size: 9px;
          color: var(--text-dim);
          letter-spacing: 0.05em;
        }
        .wall-text {
          font-size: 13px;
          color: var(--text-primary);
          line-height: 1.5;
          word-break: break-word;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = (now - d.getTime()) / 1000;
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  } catch {
    return "";
  }
}
