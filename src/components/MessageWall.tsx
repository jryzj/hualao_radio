"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

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
  // "default" = glass-panel frame, bordered items, avatar visible, text left-aligned
  // "panel"  = fully transparent, no borders / no avatar, text right-aligned
  //           (used by the floating right-rail MessageWallPanel)
  variant?: "default" | "panel";
}

// Vertically-scrolling message wall.
//
// Two layouts depending on whether the message list fills the frame:
//   - listH >= frameH  →  [L, L] duplicated, original continuous marquee.
//   - listH <  frameH  →  [S, L, S, L] with S = frameH between copies.
//                          Items "fly through" the frame: enter from the
//                          bottom, traverse, exit the top, re-enter from the
//                          bottom. Without the spacer the items would
//                          otherwise be pinned to the top portion of the
//                          frame for the entire cycle.
//
// The animation duration is scaled so each message's pixels/sec stays
// constant regardless of whether a spacer is in play.
//
// Tailwind v4 migration: the 4 inline <style> blocks (empty, static,
// frame, item) are gone. The `wall-scroll` keyframe lives in @theme
// (used via `animate-wall-scroll`); per-track duration/paused state
// still come from inline styles. The .glass-panel className is kept
// so that MessageWallPanel's `!important` overrides cascade correctly.
export function MessageWall({
  messages,
  height,
  speedSeconds = 60,
  emptyText = "no signals yet · waiting for the first transmission",
  variant = "default",
}: Props) {
  const isPanel = variant === "panel";
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
      <div className={cn(
        "flex items-center justify-center gap-2.5 p-6 font-mono text-xs tracking-[0.05em] text-text-dim",
        !isPanel && "glass-panel",
        isPanel && "bg-transparent text-right",
      )}>
        {!isPanel && (
          <span className="h-1.5 w-1.5 animate-[neon-breathe_1.6s_ease-in-out_infinite] rounded-full bg-neon-cyan [box-shadow:0_0_8px_#00f0ff]" />
        )}
        <span>{emptyText}</span>
      </div>
    );
  }

  // Render items with stable keys. For seamless loop we render the list twice.
  // Recent messages first (newest at top of the visible area); CSS animation
  // moves the track upward so the oldest items exit the top while new ones
  // appear at the bottom.
  const ordered = [...messages].reverse();
  const list = ordered.map(m => <WallItem key={m.id} message={m} variant={variant} />);

  // Reduced motion = static, scrollable list
  if (reduced) {
    return (
      <div
        className={cn(
          "overflow-y-auto p-3",
          !isPanel && "glass-panel",
          isPanel && "bg-transparent",
        )}
        style={height ? { height, maxHeight: "60vh" } : { minHeight: 200 }}
        role="log"
        aria-label="Live audience messages"
      >
        <div className="flex flex-col gap-1.5">{list}</div>
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
      className={cn(
        "relative min-h-[180px] flex-1 overflow-hidden p-0",
        !isPanel && "glass-panel",
        isPanel && "bg-transparent shadow-none",
      )}
      style={{
        ...(height ? { height, maxHeight: "60vh" } : {}),
      }}
      role="log"
      aria-label="Live audience messages"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="flex animate-wall-scroll flex-col gap-1.5 p-3 will-change-transform"
        style={{
          ["--wall-distance" as string]: `${period}px`,
          animationDuration: `${duration}s`,
          animationPlayState: paused ? "paused" : "running",
        } as React.CSSProperties}
      >
        {spacerH > 0 && <div className="flex-none" style={{ height: spacerH }} aria-hidden />}
        <div ref={listRef} className="flex flex-col [gap:inherit]">{list}</div>
        {spacerH > 0 && <div className="flex-none" style={{ height: spacerH }} aria-hidden />}
        <div className="flex flex-col [gap:inherit]">{list}</div>
      </div>

      {/* Top + bottom fade gradients so items dissolve into the frame.
          Hidden in panel mode (transparent, no chrome to fade into). */}
      {!isPanel && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-8 [background:linear-gradient(180deg,var(--bg-glass-strong)_0%,transparent_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-8 [background:linear-gradient(0deg,var(--bg-glass-strong)_0%,transparent_100%)]" />
        </>
      )}
    </div>
  );
}

function WallItem({ message, variant = "default" }: { message: WallMessage; variant: "default" | "panel" }) {
  const initial = (message.authorName || "?").trim().charAt(0).toUpperCase();
  const isPanel = variant === "panel";
  return (
    <div className={cn(
      "flex gap-2.5 rounded-md p-2.5 transition-[background,border-color] duration-200 ease-out-soft",
      !isPanel && "border border-border-cyan border-l-2 border-l-neon-cyan bg-[rgba(0,240,255,0.03)] hover:border-border-cyan-strong hover:bg-[rgba(0,240,255,0.06)]",
      isPanel && "border-0 bg-transparent p-0 text-right hover:bg-transparent",
    )}>
      {!isPanel && (
        <span
          aria-hidden
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-neon-violet to-neon-cyan font-display text-xs font-bold uppercase text-bg-deep [box-shadow:0_0_8px_rgba(0,240,255,0.3)]"
        >
          {initial}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className={cn(
          "mb-0.5 flex items-baseline gap-2",
          isPanel && "justify-end",
        )}>
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-neon-cyan">
            {message.authorName || "anonymous"}
          </span>
          <span className="font-mono text-[9px] tracking-[0.05em] text-text-dim">
            {formatTime(message.createdAt)}
          </span>
        </div>
        <p className={cn(
          "m-0 break-words text-[13px] leading-[1.5] text-text-primary",
          isPanel && "text-right",
        )}>
          {message.content}
        </p>
      </div>
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
