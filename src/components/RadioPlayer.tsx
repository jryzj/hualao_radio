"use client";
import { useEffect, useState } from "react";
import { AudioVisualizer } from "./AudioVisualizer";
import { cn } from "@/lib/cn";

interface Theme {
  id: string;
  name: string;
  description?: string;
  persona?: { name: string; prompt?: string };
  workflow?: { name: string };
}

interface BufferStatus {
  ready: boolean;
  sentences: number;
  seconds: number;
  needed: number;
}

interface Props {
  theme: Theme | null;
  isPlaying: boolean;
  connected: boolean;
  volume: number;
  bufferStatus: BufferStatus;
  queueLength: number;
  prebufferModeLabel: string;
  analyser: AnalyserNode | null;
  onTogglePlay: () => void;
  onVolumeChange: (v: number) => void;
}

// Editorial cyberpunk broadcast console — v3.
//
// The aesthetic direction is "broadcast trade publication" — OB-4
// (mono dial), NTS Radio (square hero + mono column), Linear
// (editorial restraint). Three typography tiers, one accent color
// (cyan), restrained decoration. The visualizer remains the
// geometric heart of the card (concentric rings + FFT bars — see
// AudioVisualizer.tsx for the centering rules).
//
// Two layout regimes, switched by the `wide` Tailwind v4 custom
// variant (defined in globals.css):
//
//   `wide` fires when EITHER:
//     (a) viewport width >= 1024 (lg+ — desktop, iPad, foldables in
//         laptop mode), OR
//     (b) viewport is in landscape AND max-height <= 500 (a phone
//         in landscape — typically 360–414px tall, 640–900px wide,
//         which falls below the 1024 lg threshold).
//
//   1. Vertical stack — default. Fires when `wide` does NOT match:
//      xs / sm / md portrait, plus small landscape windows with
//      height > 500. The card reads as a magazine page: ON AIR pill
//      at top, STATION caption + RADIO·AI display title, mid-mono
//      sub-bar (frequency · UTC · LIVE), visualizer, theme/host
//      identity block with monogram, transport row, telemetry strip
//      at the bottom.
//
//   2. Two-column split — fires when `wide` matches. The visualizer
//      anchors the left column; the right column is a typographic
//      stack with a 1px "magazine spine" (border-l) on its left
//      edge. The visualizer's max-width is capped by vw on desktop
//      and by vh on phone landscape so the card always fits.
//
// Per-element `landscape-short:` and `landscape-shorter:`
// variants handle finer-grained phone-landscape size adjustments
// (tighter padding, smaller fonts, shorter button) — these are
// size-only overrides on top of the 2-col structure that `wide`
// already provides.
//
// Card chrome:
//   - Portrait (default): single 1px cyan hairline border, no
//     corner ticks (they fight the editorial register on small
//     screens). Subtle scanline overlay via `.card-scanlines`.
//   - Desktop (lg+, 3xl): same border + 4 corner ticks (cyan,
//     12px) for the broadcast-instrument feel.
//   - Outer glow: cyan + violet dual halo, soft. Hover: lift.

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// Stable pseudo-frequency: 70cm-band FM broadcast slot derived
// from the theme id. Stable across renders.
function pseudoFrequency(themeId: string | undefined): string {
  let h = 0;
  for (let i = 0; i < (themeId ?? "x").length; i++) {
    h = (h * 31 + (themeId ?? "x").charCodeAt(i)) >>> 0;
  }
  const khz = 92500 + (h % 8000); // 92.5–100.5 MHz-ish
  return `${(khz / 1000).toFixed(1)} MHz`;
}

export function RadioPlayer({
  theme,
  isPlaying,
  connected,
  volume,
  bufferStatus,
  queueLength,
  prebufferModeLabel,
  analyser,
  onTogglePlay,
  onVolumeChange,
}: Props) {
  const hostName = theme?.persona?.name ?? "AI";
  const stationName = "RADIO·AI";
  const stationNumber = "04";
  const showBuffer = isPlaying && !bufferStatus.ready;

  // Client-only timestamp to avoid SSR/CSR hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Signal level 0-100 from WS + buffer + queue.
  const signalLevel = (() => {
    if (!connected) return 0;
    if (isPlaying && bufferStatus.ready) {
      return Math.min(100, 60 + Math.min(40, queueLength * 8));
    }
    if (isPlaying) {
      const ratio = bufferStatus.seconds / Math.max(1, bufferStatus.seconds + bufferStatus.needed);
      return Math.round(20 + ratio * 50);
    }
    return 35;
  })();

  return (
    <section
      className="flex w-full items-center justify-center p-1 sm:p-2 md:p-5 lg:p-7 landscape-short:p-1 landscape-shorter:p-0.5"
      aria-label="Radio player"
    >
      <div
        data-playing={isPlaying || undefined}
        className={cn(
          // === Card frame ============================================
          // The card is a CSS grid. Single column by default (xs / sm
          // / md portrait). `wide:` (lg+ or phone landscape) flips it
          // to a 2-col split with the visualizer on the left and the
          // editorial typographic stack on the right.
          // `overflow-hidden` is the hard fallback: the text col 1
          // (minmax(180,380)) can grow up to 380px and the transport
          // row's PLAY + volume can together exceed the visible left
          // half of a narrow phone-landscape card (e.g. ~336px wide
          // card on a 480px viewport → 168px visible left half,
          // 178px transport row). Without the clip the items render
          // past the card's right edge or get hidden behind the
          // absolutely-positioned visualizer. The clip is harmless
          // for the rounded corners and the backdrop-blur — the
          // blur applies to what's behind the card, not its content.
          "card-scanlines relative isolate grid w-full grid-cols-1 overflow-hidden rounded-[18px] border border-border-cyan/60 backdrop-blur-xl",
          // Outer halo — soft dual glow (cyan + violet) sits behind
          // the card. The `isPlaying` modifier tints the halo red so
          // the whole card visibly "powers on" when broadcasting.
          "shadow-[0_0_24px_rgba(0,240,255,0.12),0_0_48px_rgba(138,43,255,0.06)] transition-all duration-500 ease-out-soft",
          "data-[playing]:shadow-[0_0_28px_rgba(255,34,68,0.18),0_0_56px_rgba(138,43,255,0.10)]",
          "hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(0,240,255,0.20),0_0_64px_rgba(138,43,255,0.10)]",
          // Vertical stack rhythm — 1-col grid gap.
          "gap-0 px-4 pt-6 pb-4",
          "sm:pt-7",
          "md:px-7 md:pt-8 md:pb-5",
          // 2-col split with magazine spine, larger gaps for the
          // typographic stack to breathe.
          //
          // Col 1 is capped at `50%` of the card width (not 380px).
          // The visualizer is absolutely positioned at `left-1/2
          // right-0` (the right half), so col 1 must not exceed 50%
          // or the text-stack content (theme name, transport row)
          // bleeds into the visualizer's area. The previous
          // `minmax(180px, 380px)` allowed col 1 to grow to 380px,
          // which on a 500px card pushed the right edge of the
          // text-stack (380px) past the visualizer's left edge
          // (250px) by 130px — the PLAY button and volume bar
          // rendered under the visualizer or past the card's right
          // edge. Capping at 50% guarantees no overlap regardless
          // of card width.
          //
          // The `landscape-any:grid-cols-[1fr_minmax(180px,380px)]`
          // override that used to live here has been removed: it
          // tried to flip the visualizer/text-stack order in phone
          // landscape, but the visualizer is absolute (not in the
          // grid flow) so the override only put the text-stack in
          // col 2 — which sits exactly where the visualizer overlay
          // lives — making the overlap worse, not better. Phone
          // landscape now uses the same grid as desktop.
          "wide:grid-cols-[minmax(180px,50%)_1fr] wide:items-center wide:gap-x-6 wide:gap-y-3 lg:px-7 lg:pt-7 lg:pb-5",
           // Designed card height — exact per viewport (a deliberate
          // aesthetic constant, not content-driven). In 2-col mode
          // (`wide:`), the card is a fixed height that accommodates
          // the visualizer (≤380px) + the text stack with vertical
          // padding. The text stack uses a flex column so it auto-sizes;
          // the visualizer uses `self-center` to V-center in its grid cell.
          "md:h-[520px] md:max-h-[520px]",
          "lg:h-[600px] lg:max-h-[600px]",
          "3xl:h-[640px] 3xl:max-h-[640px]",
          "landscape-short:h-[260px] landscape-short:max-h-[260px]",
          "landscape-shorter:h-[230px] landscape-shorter:max-h-[230px]",
          "landscape-xshort:h-[200px] landscape-xshort:max-h-[200px]",
          "3xl:gap-x-10 3xl:px-8 3xl:pt-8 3xl:pb-6",
          // Card width — smooth vw-relative, no hard ceilings at
          // phone sizes. The 2-col split at `wide:` gives the card
          // room to breathe on iPad Pro 12.9 portrait (1024×1366)
          // and desktop.
          "max-w-[min(94vw,460px)]",
          "sm:max-w-[min(90vw,540px)]",
          "md:max-w-[min(82vw,640px)]",
          "lg:max-w-[min(78vw,840px)]",
          "3xl:max-w-[min(72vw,960px)]",
          // Landscape short — compact 2-col for phone landscape.
          // The narrower cap (70vw, 500px) keeps the card clear of
          // the bottom-right FAB stack on a 568–900px-wide landscape
          // phone. Padding and gaps are also tighter so the whole
          // card fits in 360–500px of vertical space.
          "landscape-short:max-w-[min(70vw,500px)] landscape-short:gap-2.5 landscape-short:gap-x-5 landscape-short:px-4 landscape-short:pt-4 landscape-short:pb-3",
          "landscape-shorter:max-w-[min(66vw,460px)] landscape-shorter:gap-2 landscape-shorter:gap-x-4 landscape-shorter:px-3.5 landscape-shorter:pt-3.5 landscape-shorter:pb-2.5",
          "landscape-xshort:max-w-[min(64vw,400px)] landscape-xshort:gap-1.5 landscape-xshort:gap-x-2.5 landscape-xshort:px-2.5 landscape-xshort:pt-2 landscape-xshort:pb-1.5",
          // Background gradients — multi-layered for depth
          "[background:radial-gradient(ellipse_at_50%_0%,rgba(0,240,255,0.10)_0%,transparent_55%),radial-gradient(ellipse_at_50%_100%,rgba(138,43,255,0.08)_0%,transparent_55%),linear-gradient(170deg,rgba(20,20,42,0.85)_0%,rgba(8,8,18,0.70)_100%)]",
        )}
      >
        {/* === Corner ticks — desktop-only frame =====================
            Dropped on portrait (xs/sm/md) because they fight the
            editorial register. Kept at lg+ and 3xl+ for the
            broadcast-instrument feel. */}
        <div className="pointer-events-none absolute inset-2 hidden lg:block">
          <span className="absolute top-0 left-0 h-3 w-3 border-t-[1.5px] border-l-[1.5px] border-neon-cyan opacity-80" />
          <span className="absolute top-0 right-0 h-3 w-3 border-t-[1.5px] border-r-[1.5px] border-neon-cyan opacity-80" />
          <span className="absolute bottom-0 left-0 h-3 w-3 border-b-[1.5px] border-l-[1.5px] border-neon-cyan opacity-80" />
          <span className="absolute bottom-0 right-0 h-3 w-3 border-b-[1.5px] border-r-[1.5px] border-neon-cyan opacity-80" />
        </div>

        {/* === ON AIR — top of card, centered horizontally =============
            Sits in row 1 of the card grid, spanning both columns
            (col-span-full) so the pill is centered against the full
            card width — not against the left column. In 1-col mode
            it behaves identically (full-width row, centered content). */}
        <div
          className={cn(
            "col-span-full flex w-full items-center justify-center",
            "wide:justify-center",
          )}
        >
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 font-display font-semibold uppercase transition-all duration-300",
              "text-[11px] tracking-[0.36em]",
              "sm:text-[12px] sm:tracking-[0.4em]",
              "md:px-3.5 md:text-[13px]",
              "lg:px-3 lg:py-1.5 lg:text-[12px] lg:tracking-[0.36em]",
              "3xl:px-3.5 3xl:py-2 3xl:text-[13px] 3xl:tracking-[0.38em]",
              "landscape-short:px-2.5 landscape-short:py-1 landscape-short:text-[10px] landscape-short:tracking-[0.32em] landscape-short:gap-1.5",
              "landscape-xshort:px-2 landscape-xshort:py-0.5 landscape-xshort:text-[9px] landscape-xshort:tracking-[0.28em]",
              isPlaying
                ? "border-on-air-red/70 bg-[rgba(255,34,68,0.16)] text-on-air-red [text-shadow:0_0_16px_rgba(255,34,68,0.9)] [box-shadow:0_0_18px_rgba(255,34,68,0.55),inset_0_0_12px_rgba(255,34,68,0.10)] animate-[on-air-pulse_1.4s_ease-in-out_infinite]"
                : "border-border-magenta bg-[rgba(255,0,170,0.08)] text-on-air-idle [text-shadow:0_0_10px_rgba(255,0,170,0.6)] [box-shadow:0_0_14px_rgba(255,0,170,0.30),inset_0_0_8px_rgba(255,0,170,0.06)] animate-[neon-breathe_2.4s_ease-in-out_infinite]",
            )}
          >
            <span className="relative inline-block h-1.5 w-1.5 flex-none">
              <span className="absolute inset-0 rounded-full bg-current [box-shadow:0_0_10px_currentColor]" />
              {isPlaying && (
                <span className="absolute -inset-1.5 animate-ping rounded-full bg-current opacity-60" />
              )}
            </span>
            <span>ON&nbsp;AIR</span>
            {isPlaying && (
              <>
                <span aria-hidden className="opacity-50">·</span>
                <span>LIVE</span>
              </>
            )}
          </div>
        </div>

        {/* === Text stack — 2-col wrapper for 5 text items =============
            In 2-col mode (`wide:`), this wrapper is a single grid cell
            (col 1 = left side) containing a flex column of 5 items
            (header, sub-bar, theme, transport, telemetry). ON AIR
            has been moved out to row 1. Tighter gaps (gap-1.5) keep
            the stack short enough to fit in the 280px phone-landscape
            card and 300-640px tablet/desktop cards. The flex column
            V-centers via `justify-center`. In 1-col mode the wrapper
            flows normally with each item's mt/border for separation. */}
        <div
          className={cn(
            "flex flex-col items-center",
            // `min-w-0` is required because the text-stack is a CSS
            // grid item. Grid items default to `min-width: auto`,
            // which means they refuse to shrink below their
            // content's intrinsic width. Without `min-w-0`, a long
            // theme name in the identity block could force the
            // text-stack to grow wider than its allotted 50% col,
            // pushing the transport row (PLAY + volume) past the
            // visualizer's left edge at 50% of the card. `min-w-0`
            // lets the item shrink to fit, and the transport row
            // already wraps via `flex-col` (see below) so vertical
            // stacking is the fallback rather than horizontal
            // overflow.
            "wide:min-w-0",
            "wide:col-span-1 wide:row-start-2 wide:col-start-1 wide:flex wide:flex-col wide:items-start wide:gap-1.5 wide:justify-center",
          )}
        >

        {/* === Header — STATION caption + RADIO·AI display title ======
            Magazine layout: small mono "eyebrow" caption (STATION 04)
            above an oversized display title. Tracking tightens from
            0.18em (logo register) to 0.04em (editorial headline).
            Signal bars dropped from here — they live in the telemetry
            strip at the bottom of the card, no longer competing for
            the same row as the title. */}
        <div
          className={cn(
            "flex w-full flex-col items-center text-center",
            "wide:items-start wide:text-left",
            // Hairline above the header in 1-col separates it from
            // the ON AIR pill with vertical rhythm.
            "mt-5 border-t border-border-cyan/20 pt-5",
            "md:mt-6 md:pt-6",
            "wide:mt-0 wide:border-t-0 wide:pt-0",
          )}
        >
          <div className="flex items-baseline gap-2 font-mono text-[9px] tracking-[0.3em] text-text-dim uppercase sm:gap-2.5 sm:text-[10px] sm:tracking-[0.34em] md:tracking-[0.36em]">
            <span>STATION</span>
            <span className="text-neon-cyan [text-shadow:0_0_8px_rgba(0,240,255,0.6)]">
              {stationNumber}
            </span>
          </div>
          <h1
            className={cn(
              "m-0 mt-1 font-display font-bold leading-[0.9] tracking-[0.04em] text-text-primary",
              "[font-size:clamp(28px,8vw,38px)] [text-shadow:0_0_24px_rgba(0,240,255,0.32)]",
              "sm:[font-size:clamp(32px,7vw,42px)]",
              "md:mt-1.5 md:[font-size:clamp(36px,4.4vw,46px)]",
              "lg:[font-size:clamp(34px,3.2vw,44px)]",
              "3xl:[font-size:clamp(40px,3.2vw,52px)]",
              "landscape-short:[font-size:clamp(18px,4vh,26px)]",
              "landscape-shorter:[font-size:clamp(16px,3.5vh,22px)]",
              "landscape-xshort:[font-size:clamp(14px,3vh,19px)]",
            )}
          >
            {stationName}
          </h1>
        </div>

        {/* === Sub-bar — mid-mono inline metadata strip ===============
            Frequency · UTC time · LIVE. Sized 14-16px portrait →
            18-22px desktop, JetBrains Mono weight 500, tabular-nums.
            Frequency in cyan, UTC in secondary, LIVE in red. Single
            horizontal row, centered in 1-col, left-aligned in 2-col.
            This is the "broadcast dial" identity — the frequency
            was promoted from a small mono label to the secondary
            hero text. */}
        <div
          className={cn(
            "flex w-full flex-wrap items-baseline justify-center gap-x-3 font-mono tracking-[0.04em]",
            "text-[13px] sm:text-[14px] md:text-[15px] lg:text-[15px] lg:tracking-[0.05em] 3xl:text-[17px]",
            "wide:justify-start",
            "landscape-short:text-[11px] landscape-short:tracking-[0.04em]",
            "landscape-shorter:text-[10px]",
            "landscape-xshort:text-[9px]",
            // Hairline above separates it from the header.
            "mt-1.5 border-t border-border-cyan/20 pt-2",
            "xs:mt-2 xs:pt-2.5",
            "md:mt-2.5 md:pt-3.5",
            "wide:mt-0 wide:border-t-0 wide:pt-0",
            // Hidden in wide mode — replaced by the combined row below
            "wide:hidden",
          )}
        >
          <span className="inline-flex items-baseline gap-1.5 text-neon-cyan [text-shadow:0_0_12px_rgba(0,240,255,0.55)] tabular-nums">
            <span className="opacity-50 text-[0.7em] tracking-[0.16em]">FREQ</span>
            <span className="font-medium">{pseudoFrequency(theme?.id)}</span>
          </span>
          <span aria-hidden className="opacity-30 text-[0.85em]">·</span>
          <span className="inline-flex items-baseline gap-1.5 text-text-secondary tabular-nums">
            <span className="opacity-50 text-[0.7em] tracking-[0.16em]">UTC</span>
            <span className="font-medium text-text-primary/85">
              {now ? formatTimestamp(now) : "--:--:--"}
            </span>
          </span>
          {isPlaying && (
            <>
              <span aria-hidden className="opacity-30 text-[0.85em]">·</span>
              <span className="inline-flex items-baseline gap-1.5 text-on-air-red [text-shadow:0_0_10px_rgba(255,34,68,0.7)]">
                <span className="inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-current animate-pulse [box-shadow:0_0_8px_currentColor]" />
                <span className="font-medium tracking-[0.18em]">LIVE</span>
              </span>
            </>
          )}
        </div>

        {/* === Combined sub-bar + telemetry row (wide only) =============
            Merges the mono metadata strip (frequency·UTC·LIVE) with the
            telemetry readout (WS|SIG|BUF|Q) into one horizontal row to
            save vertical space in 2-col layout. Hidden outside wide. */}
        <div
          className={cn(
            "hidden w-full items-baseline justify-between gap-x-3",
            "wide:flex",
            "font-mono tracking-[0.04em]",
            "text-[12px]",
            "lg:text-[13px]",
            "3xl:text-[14px]",
            "landscape-short:text-[11px]",
            "landscape-shorter:text-[10px]",
            "landscape-xshort:text-[9px]",
            "mt-2 border-t border-border-cyan/20 pt-2.5",
            "lg:mt-0 lg:border-t-0 lg:pt-0",
          )}
        >
          <div className="inline-flex flex-wrap items-baseline gap-x-2.5">
            <span className="inline-flex items-baseline gap-1 text-neon-cyan [text-shadow:0_0_10px_rgba(0,240,255,0.5)] tabular-nums">
              <span className="opacity-50 text-[0.7em] tracking-[0.16em]">FREQ</span>
              <span className="font-medium">{pseudoFrequency(theme?.id)}</span>
            </span>
            <span aria-hidden className="opacity-30 text-[0.85em]">·</span>
            <span className="inline-flex items-baseline gap-1 text-text-secondary tabular-nums">
              <span className="opacity-50 text-[0.7em] tracking-[0.16em]">UTC</span>
              <span className="font-medium text-text-primary/85">
                {now ? formatTimestamp(now) : "--:--:--"}
              </span>
            </span>
            {isPlaying && (
              <>
                <span aria-hidden className="opacity-30 text-[0.85em]">·</span>
                <span className="inline-flex items-baseline gap-1 text-on-air-red [text-shadow:0_0_8px_rgba(255,34,68,0.6)]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse [box-shadow:0_0_6px_currentColor]" />
                  <span className="font-medium tracking-[0.18em]">LIVE</span>
                </span>
              </>
            )}
          </div>
          <div className="telemetry-strip__items">
            <div className="inline-flex items-center gap-1">
              <span
                className={cn(
                  "h-[5px] w-[5px] rounded-full",
                  connected
                    ? "bg-on-air-red [box-shadow:0_0_4px_var(--on-air-red)]"
                    : "bg-neon-yellow [box-shadow:0_0_3px_var(--neon-yellow)]",
                )}
              />
              <span>
                <span className="opacity-60">WS</span>
                <span className="text-text-primary/85 ml-0.5">
                  {connected ? "LIVE" : "LINK…"}
                </span>
              </span>
            </div>
            <div className="inline-flex items-center gap-1" aria-label={`Signal ${signalLevel}%`}>
              <span className="opacity-60">SIG</span>
              <span className="text-neon-cyan/90 tabular-nums">{signalLevel}%</span>
            </div>
            {showBuffer && (
              <div className="inline-flex items-center gap-1">
                <span className="opacity-60">BUF</span>
                <span className="text-neon-yellow tabular-nums">
                  {bufferStatus.sentences}{prebufferModeLabel}/{bufferStatus.seconds.toFixed(1)}s
                </span>
              </div>
            )}
            {queueLength > 0 && (
              <div className="inline-flex items-center gap-1">
                <span className="opacity-60">Q</span>
                <span className="text-neon-cyan tabular-nums">{queueLength}</span>
              </div>
            )}
          </div>
        </div>

        {/* === Visualizer — the protagonist (centered) ==================
            The visualizer is the geometric heart of the card. It is
            explicitly centered in both layout modes:
              - 1-col: `mx-auto` centers horizontally; `justify-self-center`
                reinforces on grid; generous `my-6` / `md:my-8` vertical
                margin makes it the visual focal point between the
                text above (title, sub-bar) and below (theme, transport,
                telemetry).
              - 2-col (`wide:`): `justify-self-center` centers the
                visualizer within col 1; `items-center` on the card
                vertically centers it against the right column. The
                right edge carries a 1px cyan hairline — the
                "magazine spine" between visualizer and text.
            Sizing is bumped ~10-15% from v3 so the visualizer reads
            as the dominant element, not a decorative insert.
            The visualizer itself enforces 1:1 aspect via
            `aspect-square`; the AudioViz component uses ResizeObserver
            to track the actual rendered size and keeps the FFT and
            SVG rings concentric. */}

        {/* === Theme/host identity block — monogram + lines ============
            Mirrors the MessageWall card pattern: a gradient
            monogram circle on the left, theme + host stacked on the
            right. The monogram is a 32-40px circle with a violet→
            cyan gradient, a soft glow, and the first letter of the
            host name in display font. The theme line uses mono
            with the `// ` prefix; the host line uses body type. */}
        <div
          className={cn(
            "flex w-full flex-col items-center gap-2.5 text-center",
            "wide:flex-row wide:items-center wide:gap-3.5 wide:text-left",
            // Hairline above separates it from the visualizer / sub-bar
            "mt-2.5 border-t border-border-cyan/20 pt-3",
            "xs:mt-3 xs:pt-3.5",
            "md:mt-5 md:gap-3 md:pt-5",
            "wide:mt-0 wide:border-t-0 wide:pt-0",
            "landscape-short:gap-2",
            "landscape-shorter:gap-1.5",
            "landscape-xshort:gap-1",
          )}
        >
          <div
            aria-hidden
            className={cn(
              "flex flex-none items-center justify-center rounded-full",
              "h-9 w-9 text-[14px]",
              "sm:h-10 sm:w-10 sm:text-[15px]",
              "md:h-10 md:w-10 md:text-[14px]",
              "lg:h-10 lg:w-10 lg:text-[15px]",
              "3xl:h-12 3xl:w-12 3xl:text-[17px]",
              "landscape-short:h-6 landscape-short:w-6 landscape-short:text-[10px]",
              "landscape-shorter:h-5 landscape-shorter:w-5 landscape-shorter:text-[9px]",
              "landscape-xshort:h-4 landscape-xshort:w-4 landscape-xshort:text-[8px]",
              "bg-[linear-gradient(135deg,var(--neon-violet)_0%,var(--neon-cyan)_100%)] [box-shadow:0_0_14px_rgba(0,240,255,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]",
              "font-display font-bold uppercase text-bg-deep tracking-[0.04em]",
            )}
          >
            {(hostName[0] ?? "A").toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p
              className={cn(
                "m-0 truncate font-mono tracking-[0.04em] text-neon-cyan [text-shadow:0_0_10px_rgba(0,240,255,0.45)]",
                "text-[12px] sm:text-[13px] md:text-[14px] lg:text-[15px] lg:tracking-[0.06em] 3xl:text-[16px]",
                "landscape-short:text-[10px]",
                "landscape-shorter:text-[9px]",
                "landscape-xshort:text-[8px]",
              )}
            >
              <span className="text-text-dim/70">{"// "}</span>
              {theme ? theme.name : "initializing signal…"}
            </p>
            <p
              className={cn(
                "m-0 truncate font-body tracking-[0.02em] text-text-secondary",
                "text-[11px] sm:text-[12px] md:text-[13px] lg:text-[13px]",
                "landscape-short:text-[10px]",
                "landscape-shorter:text-[9px]",
                "landscape-xshort:text-[8px]",
              )}
            >
              hosted by <span className="text-text-primary">{hostName}</span>
              {theme?.workflow?.name && (
                <>
                  <span className="mx-1.5 text-text-dim/50" aria-hidden>·</span>
                  <span className="font-mono text-[0.85em] tracking-[0.16em] text-text-dim uppercase">
                    {theme.workflow.name}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* === Transport — PLAY + segmented volume ====================
            Single horizontal row in every layout regime. The PLAY
            button and volume container sit side-by-side, centered
            in 1-col (portrait) and left-aligned in 2-col (`wide:`)
            where the text-stack lives in col 1 (capped at 50% of
            the card width — see the grid comment above for why).
            The col 1 cap of 50% guarantees there's enough room on
            the same line for both items in phone landscape:
              - landscape-short:   PLAY ~84 + gap 8 + volume ~86 ≈ 178px
              - landscape-shorter: PLAY ~72 + gap 6 + volume ~99 ≈ 177px
              - landscape-xshort:  PLAY ~51 + gap 4 + volume ~57 ≈ 112px
            All three fit comfortably in the 50% col of a 400-500px
            card (200-250px), so the row layout works everywhere.

            iOS touch targets are >= 44px via the
            `supports-[-webkit-touch-callout:none]:min-h-[44px]`
            variant — the volume thumb is also enlarged on iOS for
            the same reason. The volume slider renders a 5-segment
            "dial" visual (`.dial-segmented` in globals.css) with a
            transparent range input on top for accessibility. */}
        <div
          className={cn(
            "flex w-full flex-wrap items-center justify-center gap-3",
            "md:gap-4",
            "wide:justify-start",
            // Hairline above separates it from the identity block.
            "mt-2.5 border-t border-border-cyan/20 pt-3",
            "xs:mt-3 xs:pt-3.5",
            "md:mt-5 md:pt-5",
            "wide:mt-0 wide:border-t-0 wide:pt-0",
            "landscape-short:gap-2",
            "landscape-shorter:gap-1.5",
            "landscape-xshort:gap-1",
          )}
        >
          <button
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Stop playback" : "Start playback"}
            className={cn(
              "group relative inline-flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-md border-[1.5px] px-5 py-2 font-display font-semibold tracking-[0.22em] transition-[background,border-color,box-shadow,color] duration-200 ease-out-soft touch-manipulation supports-[-webkit-touch-callout:none]:min-h-[44px]",
              "text-[11px] sm:px-6 sm:py-2.5 sm:text-[12px]",
              "md:px-6 md:py-2.5 md:text-[12px] md:tracking-[0.22em]",
              "lg:px-6 lg:py-2 lg:text-[12px] lg:tracking-[0.24em]",
              "3xl:px-7 3xl:py-2.5 3xl:text-[13px]",
              "landscape-short:px-2.5 landscape-short:py-1 landscape-short:text-[10px] landscape-short:tracking-[0.18em]",
              "landscape-shorter:px-2 landscape-shorter:py-0.5 landscape-shorter:text-[9px]",
              "landscape-xshort:px-1.5 landscape-xshort:py-0.5 landscape-xshort:text-[8px] landscape-xshort:tracking-[0.14em]",
              isPlaying
                ? "border-on-air-red/70 bg-[rgba(255,34,68,0.10)] text-on-air-red [box-shadow:0_0_14px_rgba(255,34,68,0.35),inset_0_0_14px_rgba(255,34,68,0.06)] hover:bg-[rgba(255,34,68,0.18)] hover:[box-shadow:0_0_28px_rgba(255,34,68,0.55),inset_0_0_20px_rgba(255,34,68,0.10)]"
                : "border-neon-cyan/70 bg-[rgba(0,240,255,0.05)] text-neon-cyan [box-shadow:0_0_12px_rgba(0,240,255,0.20),inset_0_0_12px_rgba(0,240,255,0.05)] hover:-translate-y-px hover:bg-[rgba(0,240,255,0.12)] hover:[box-shadow:0_0_24px_rgba(0,240,255,0.45),inset_0_0_18px_rgba(0,240,255,0.10)]",
            )}
          >
            <span aria-hidden className="inline-flex items-center">
              {isPlaying ? (
                <span className="inline-flex items-center gap-[3px]">
                  <span className="inline-block h-3 w-[3px] rounded-sm bg-current" />
                  <span className="inline-block h-3 w-[3px] rounded-sm bg-current" />
                </span>
              ) : (
                <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden>
                  <path d="M2.5 1 L10.5 6 L2.5 11 Z" fill="currentColor" />
                </svg>
              )}
            </span>
            <span className="relative">
              {isPlaying ? "STOP" : "PLAY"}
              <span
                aria-hidden
                className="absolute -bottom-0.5 left-0 h-px w-0 bg-current transition-all duration-300 group-hover:w-full"
              />
            </span>
          </button>

          <div
            className={cn(
              "flex items-center gap-2.5 rounded-md border border-border-cyan/50 bg-black/40 px-3 py-2 backdrop-blur",
              "sm:gap-3 sm:px-3 sm:py-2",
              "md:gap-3 md:px-3 md:py-2",
              "lg:gap-3 lg:px-3 lg:py-1.5",
              "landscape-short:px-2 landscape-short:py-1 landscape-short:gap-2",
              "landscape-shorter:px-1.5 landscape-shorter:py-0.5",
              "landscape-xshort:px-1 landscape-xshort:py-0.5",
            )}
          >
            <span className="font-mono text-[9px] tracking-[0.18em] text-text-dim uppercase sm:tracking-[0.2em] landscape-any:hidden">Vol</span>
            <div
              className={cn(
                "relative",
                "w-[68px]",
                "sm:w-[80px]",
                "md:w-[88px]",
                "lg:w-[104px]",
                "landscape-short:w-[36px]",
                "landscape-shorter:w-[28px]",
                "landscape-xshort:w-[24px]",
              )}
            >
              <div className="dial-segmented pointer-events-none">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "dial-segmented__seg",
                      i / 5 < volume && "dial-segmented__seg--on",
                    )}
                  />
                ))}
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={e => onVolumeChange(parseFloat(e.target.value))}
                className="volume-slider absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent outline-none"
                aria-label="Volume"
              />
            </div>
            <span
              className={cn(
                "min-w-7 text-right font-mono font-medium text-neon-cyan tabular-nums",
                "text-[10px]",
                "md:min-w-8 md:text-[11px]",
                "lg:min-w-9 lg:text-xs",
                "landscape-short:text-[9px]",
                "landscape-shorter:text-[8px]",
                "landscape-xshort:text-[7px] landscape-xshort:min-w-5",
              )}
            >
              {Math.round(volume * 100)}
            </span>
          </div>
        </div>

        {/* === Status row — telemetry strip ============================
            Reframed as a bracketed telemetry readout. The
            `[ telemetry ]` label sits centered above the items in
            mono 9px dim cyan. Items use the `.telemetry-strip` family
            in globals.css — mono, dot-separated flex with the
            standard 0.4 separator. The signal-level indicator (moved
            here from the header) is the first item; BUFFER and QUEUE
            are conditional. */}
          <div
            className={cn(
              "w-full",
              // Hairline above separates it from the transport row.
              "mt-1.5 border-t border-border-cyan/20 pt-2",
              "xs:mt-2 xs:pt-2.5",
              "md:mt-4 md:pt-4",
              "wide:mt-0 wide:border-t-0 wide:pt-0",
              // Hidden in wide mode — replaced by combined row above
              "wide:hidden",
            )}
          >
            <div className="telemetry-strip">
              <span className="telemetry-strip__label">[ telemetry ]</span>
              <div className="telemetry-strip__items">
              <div className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-[6px] w-[6px] rounded-full",
                    connected
                      ? "bg-on-air-red [box-shadow:0_0_6px_var(--on-air-red)] animate-[neon-breathe_1.4s_ease-in-out_infinite]"
                      : "bg-neon-yellow [box-shadow:0_0_4px_var(--neon-yellow)]",
                  )}
                />
                <span>
                  <span className="opacity-60">WS</span>
                  <span className="text-text-primary/85 ml-1">
                    {connected ? "LIVE" : "LINK…"}
                  </span>
                </span>
              </div>
              {/* Signal level — was in the header in v2, demoted to
                  the telemetry strip where it belongs. */}
              <div className="inline-flex items-center gap-1.5" aria-label={`Signal ${signalLevel}%`}>
                <span className="opacity-60">SIG</span>
                <span className="text-neon-cyan/90 tabular-nums">{signalLevel}%</span>
                <span className="inline-flex items-end gap-[1.5px] ml-0.5">
                  {[20, 40, 60, 80, 100].map((threshold) => {
                    const on = signalLevel >= threshold;
                    return (
                      <span
                        key={threshold}
                        className={cn(
                          "block w-[2px] rounded-[1px] transition-all duration-300",
                          on
                            ? "bg-neon-cyan [box-shadow:0_0_4px_rgba(0,240,255,0.7)]"
                            : "bg-neon-cyan/15",
                        )}
                        style={{ height: `${3 + threshold / 5}px` }}
                      />
                    );
                  })}
                </span>
              </div>
              {showBuffer && (
                <div className="inline-flex items-center gap-1.5">
                  <span className="opacity-60">BUF</span>
                  <span className="text-neon-yellow tabular-nums">
                    {bufferStatus.sentences}{prebufferModeLabel}/{bufferStatus.seconds.toFixed(1)}s
                    <span className="text-text-dim/70"> · need {bufferStatus.needed}</span>
                  </span>
                </div>
              )}
              {queueLength > 0 && (
                <div className="inline-flex items-center gap-1.5">
                  <span className="opacity-60">Q</span>
                  <span className="text-neon-cyan tabular-nums">{queueLength}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        </div>
        {/* === End text-stack wrapper ============================== */}

        {/* === Visualizer — centered in the card's right half ==========
            In 2-col mode (`wide:`), this wrapper covers the right
            half of the card (left-1/2 right-0, full height) so the
            visualizer inside is automatically centered horizontally
            in the right half. `items-center` on the wrapper
            vertically centers the visualizer at the card's center.
            The wrapper is taken out of the grid flow with
            `absolute`, so the text-stack can occupy col 1 of the
            grid without competing for the second column.
            The left edge of the wrapper (at 50% of the card) carries
            a 1px cyan hairline — the "magazine spine" between text
            and visualizer.
            In 1-col mode the visualizer flows as a normal block
            child, with `mx-auto` for H-center and `my-3` for vertical
            rhythm between the text and the next block. */}
        <div
          className={cn(
            "col-span-full mx-auto my-2 flex w-full items-center justify-center",
            "xs:my-2.5",
            "md:my-4",
            "wide:absolute wide:inset-y-0 wide:left-1/2 wide:right-0 wide:mx-0 wide:my-0 wide:w-auto wide:flex wide:items-center wide:justify-center",
            "landscape-short:my-2",
            "landscape-shorter:my-1.5",
            "landscape-xshort:my-1",
            "wide:border-l wide:border-border-cyan/40 wide:pl-[25px] wide:pr-2 md:wide:pl-[37px] lg:wide:pl-[37px] 3xl:wide:pl-[41px] landscape-shorter:wide:pl-[23px] landscape-xshort:wide:pl-[18px] landscape-xshort:wide:pr-1",
          )}
        >
          <div
            className={cn(
              "relative aspect-square",
              "w-[clamp(150px,44vw,190px)]",
              "sm:w-[clamp(190px,45vw,260px)]",
              "md:w-[clamp(260px,38vw,340px)]",
              "lg:w-[clamp(300px,24vw,380px)]",
              "3xl:w-[clamp(340px,22vw,420px)]",
              "landscape-short:w-[clamp(180px,42vh,220px)]",
              "landscape-shorter:w-[clamp(140px,35vh,180px)]",
              "landscape-xshort:w-[clamp(120px,32vh,160px)]",
            )}
          >
            <AudioVisualizer analyser={analyser} isPlaying={isPlaying} barCount={48} />
          </div>
        </div>

      </div>

      <style>{`
        /* Volume slider — pseudo-elements are awkward in Tailwind.
           The slider sits absolutely on top of a 5-segment ".dial-segmented"
           visual, so the track is transparent and only the thumb is
           styled. The thumb is a glowing cyan circle that drags across
           the segments, giving a "broadcast fader" feel. */
        .volume-slider {
          background: transparent;
        }
        .volume-slider::-webkit-slider-runnable-track {
          background: transparent;
          height: 18px;
          border: none;
        }
        .volume-slider::-moz-range-track {
          background: transparent;
          height: 18px;
          border: none;
        }
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--neon-cyan);
          box-shadow: 0 0 8px var(--neon-cyan), 0 0 16px rgba(0, 240, 255, 0.4);
          border: 1.5px solid var(--bg-deep);
          cursor: pointer;
          margin-top: 0;
        }
        .volume-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--neon-cyan);
          box-shadow: 0 0 8px var(--neon-cyan), 0 0 16px rgba(0, 240, 255, 0.4);
          border: 1.5px solid var(--bg-deep);
          cursor: pointer;
        }
        /* iOS: increase the volume thumb tap area (a 12px thumb is hard
           to grab on touch). The play button min-height is set inline via
           the supports-[-webkit-touch-callout:none]: variant. */
        @supports (-webkit-touch-callout: none) {
          .volume-slider::-webkit-slider-thumb {
            width: 22px;
            height: 22px;
            box-shadow: 0 0 10px var(--neon-cyan), 0 0 22px rgba(0, 240, 255, 0.5);
          }
          .volume-slider::-moz-range-thumb {
            width: 22px;
            height: 22px;
            box-shadow: 0 0 10px var(--neon-cyan), 0 0 22px rgba(0, 240, 255, 0.5);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-playing] [class*="animate-"] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
