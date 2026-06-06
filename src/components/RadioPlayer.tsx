"use client";
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

// Cyberpunk player card. Centerpiece is the audio visualizer surrounded by
// 4 corner ticks, with an ON-AIR badge, station + theme meta, transport
// controls (play + volume), and a status row showing WS link / buffer /
// queue depth.
//
// Tailwind v4 migration: the 300-line <style> block is gone. Pseudo-element
// styles for the volume slider thumb (`::-webkit-slider-thumb` /
// `::-moz-range-thumb`) and iOS-specific touch overrides
// (`@supports (-webkit-touch-callout: none)`) stay in a tiny <style>
// block at the bottom — pseudo-elements are awkward to express in
// utility classes. Everything else is utility-first.
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
  const stationName = "RADIO AI";
  const showBuffer = isPlaying && !bufferStatus.ready;

  return (
    <section className="flex items-center justify-center p-4" aria-label="Radio player">
      <div
        className={cn(
          // Base: mobile
          "relative flex w-full max-w-[560px] flex-col items-center gap-4 rounded-[14px] border border-border-cyan px-6 pt-7 pb-6 backdrop-blur-[12px] [background:radial-gradient(ellipse_at_center_top,rgba(0,240,255,0.06)_0%,transparent_50%),linear-gradient(160deg,rgba(20,20,42,0.6)_0%,rgba(13,13,24,0.4)_100%)]",
          // xs (≤380)
          "max-xs:gap-3 max-xs:px-3 max-xs:py-4",
          // sm (≤480)
          "max-sm:px-4 max-sm:py-5",
          // md (≥768)
          "md:max-w-[640px] md:gap-5 md:px-8 md:pt-8 md:pb-7",
          // lg (≥1024)
          "lg:max-w-[580px] lg:gap-5 lg:px-9 lg:pt-9 lg:pb-8",
          // 3xl (≥1366)
          "3xl:max-w-[640px] 3xl:gap-6 3xl:px-10 3xl:pt-11 3xl:pb-9",
          // landscape short
          "landscape:max-h-[500px]:gap-2 landscape:max-h-[500px]:px-3.5 landscape:max-h-[500px]:py-3",
          "landscape:max-h-[420px]:gap-1.5 landscape:max-h-[420px]:px-3 landscape:max-h-[420px]:py-2",
        )}
      >
        <div className="absolute top-1.5 left-1.5 h-3.5 w-3.5 border-t-[1.5px] border-l-[1.5px] border-neon-cyan opacity-70" />
        <div className="absolute top-1.5 right-1.5 h-3.5 w-3.5 border-t-[1.5px] border-r-[1.5px] border-neon-cyan opacity-70" />
        <div className="absolute bottom-1.5 left-1.5 h-3.5 w-3.5 border-b-[1.5px] border-l-[1.5px] border-neon-cyan opacity-70" />
        <div className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 border-b-[1.5px] border-r-[1.5px] border-neon-cyan opacity-70" />

        {/* ON AIR badge — color state machine */}
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-2 rounded-pill text-[11px] font-semibold tracking-[0.25em] transition-[color,box-shadow,background] duration-300 ease-out-soft",
            // idle vs playing
            !isPlaying &&
              "border border-border-magenta bg-[rgba(255,0,170,0.08)] text-on-air-idle animate-[neon-breathe_2s_ease-in-out_infinite]",
            isPlaying &&
              "border border-[rgba(255,34,68,0.5)] bg-[rgba(255,34,68,0.12)] text-on-air-red [text-shadow:0_0_8px_rgba(255,34,68,0.6)] animate-[on-air-pulse_0.8s_ease-in-out_infinite]",
            // md+
            "md:px-4 md:py-1.5 md:text-xs",
            // lg+
            "lg:px-[18px] lg:py-2 lg:text-[13px] lg:tracking-[0.3em]",
            // landscape short
            "landscape:max-h-[500px]:px-2.5 landscape:max-h-[500px]:py-[3px] landscape:max-h-[500px]:text-[9px] landscape:max-h-[500px]:tracking-[0.2em]",
          )}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-current [box-shadow:0_0_8px_currentColor]" />
          <span className="font-display">ON AIR</span>
        </div>

        {/* Visualizer ring (centerpiece) */}
        <div
          className={cn(
            "flex aspect-square w-[clamp(180px,60vw,320px)] items-center justify-center",
            "max-xs:w-[clamp(160px,70vw,220px)]",
            "md:w-[clamp(280px,48vw,380px)]",
            "lg:w-[clamp(300px,30vw,400px)]",
            "3xl:w-[clamp(340px,28vw,440px)]",
            "landscape:max-h-[500px]:w-[clamp(120px,30vh,200px)]",
            "landscape:max-h-[420px]:w-[clamp(100px,25vh,160px)]",
          )}
        >
          <AudioVisualizer analyser={analyser} isPlaying={isPlaying} barCount={48} />
        </div>

        {/* Station + theme label */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1
            className={cn(
              "m-0 font-bold tracking-[0.18em] text-text-primary [font-size:clamp(28px,6vw,40px)] [text-shadow:0_0_18px_rgba(0,240,255,0.25)]",
              "max-xs:text-[22px] max-xs:tracking-[0.12em]",
              "md:[font-size:clamp(36px,5vw,48px)]",
              "lg:[font-size:clamp(40px,4.5vw,56px)] lg:tracking-[0.22em]",
              "3xl:[font-size:clamp(44px,4vw,60px)]",
              "landscape:max-h-[500px]:text-lg landscape:max-h-[500px]:tracking-[0.12em]",
              "landscape:max-h-[420px]:text-base",
            )}
          >
            {stationName}
          </h1>
          <p
            className={cn(
              "m-0 font-mono text-[13px] tracking-[0.05em] text-neon-cyan",
              "md:text-[14px]",
              "lg:text-[15px]",
              "landscape:max-h-[500px]:text-[11px]",
            )}
          >
            <span className="text-text-dim">// </span>
            {theme ? theme.name : "initializing signal..."}
          </p>
          <p
            className={cn(
              "m-0 font-mono text-[11px] tracking-[0.08em] text-text-secondary",
              "md:text-xs",
              "lg:text-[13px]",
              "landscape:max-h-[500px]:text-[10px]",
              "landscape:max-h-[420px]:hidden",
            )}
          >
            hosted by {hostName}
          </p>
        </div>

        {/* Transport controls */}
        <div className="flex w-full flex-wrap items-center justify-center gap-5">
          <button
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Stop playback" : "Start playback"}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2.5 rounded-md border-[1.5px] border-neon-cyan bg-[rgba(0,240,255,0.05)] px-7 py-3 text-[13px] font-medium tracking-[0.2em] text-neon-cyan transition-all duration-200 ease-out-soft [box-shadow:0_0_12px_rgba(0,240,255,0.2),inset_0_0_12px_rgba(0,240,255,0.05)] supports-[-webkit-touch-callout:none]:min-h-[44px] hover:-translate-y-px hover:bg-[rgba(0,240,255,0.12)] hover:[box-shadow:0_0_24px_rgba(0,240,255,0.4),inset_0_0_18px_rgba(0,240,255,0.1)]",
              isPlaying &&
                "border-on-air-red bg-[rgba(255,34,68,0.08)] text-on-air-red [box-shadow:0_0_12px_rgba(255,34,68,0.3),inset_0_0_12px_rgba(255,34,68,0.05)] hover:bg-[rgba(255,34,68,0.15)] hover:[box-shadow:0_0_24px_rgba(255,34,68,0.5),inset_0_0_18px_rgba(255,34,68,0.1)]",
              "max-xs:px-5 max-xs:py-2.5 max-xs:text-xs",
              "md:px-8 md:py-3.5",
              "lg:px-9 lg:py-3.5 lg:text-sm",
              "landscape:max-h-[500px]:px-4 landscape:max-h-[500px]:py-2 landscape:max-h-[500px]:text-[11px]",
            )}
          >
            {isPlaying ? (
              <>
                <span className="inline-flex items-center gap-0.5">
                  <span className="inline-block h-3 w-[3px] rounded-sm bg-current" />
                  <span className="inline-block h-3 w-[3px] rounded-sm bg-current" />
                </span>
                <span>STOP</span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center">
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
                    <path d="M2 1 L11 6 L2 11 Z" fill="currentColor" />
                  </svg>
                </span>
                <span>PLAY</span>
              </>
            )}
          </button>

          <div
            className={cn(
              "flex items-center gap-2.5 rounded-pill border border-border-cyan bg-[rgba(0,0,0,0.3)] px-3.5 py-2",
              "md:gap-3 md:px-4 md:py-2.5",
              "lg:gap-3.5 lg:px-[18px] lg:py-2.5",
              "landscape:max-h-[500px]:px-2.5 landscape:max-h-[500px]:py-1",
            )}
          >
            <span className="font-mono text-[9px] tracking-[0.15em] text-text-dim">VOL</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={e => onVolumeChange(parseFloat(e.target.value))}
              className="volume-slider h-[3px] w-20 cursor-pointer appearance-none rounded-sm bg-bg-elevated outline-none supports-[-webkit-touch-callout:none]:h-1.5 max-sm:w-[60px] md:w-[100px] lg:w-[120px] landscape:max-h-[500px]:w-[60px]"
              aria-label="Volume"
            />
            <span
              className={cn(
                "min-w-6 text-right font-mono text-[10px] text-neon-cyan",
                "lg:min-w-7 lg:text-xs",
                "landscape:max-h-[500px]:text-[10px]",
              )}
            >
              {Math.round(volume * 100)}
            </span>
          </div>
        </div>

        {/* Status row */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-center gap-4 font-mono text-[10px] tracking-[0.1em] text-text-dim",
            "md:gap-[18px] md:text-[11px]",
            "lg:gap-5 lg:text-xs",
            "landscape:max-h-[500px]:gap-2.5 landscape:max-h-[500px]:text-[9px]",
          )}
        >
          <div className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "h-[5px] w-[5px] rounded-full",
                connected
                  ? "bg-on-air-red [box-shadow:0_0_4px_var(--on-air-red)] animate-[neon-breathe_1.4s_ease-in-out_infinite]"
                  : "bg-neon-yellow [box-shadow:0_0_4px_var(--neon-yellow)]",
              )}
            />
            <span className="text-text-dim">{connected ? "WS_LINK" : "WS_LINK…"}</span>
          </div>
          {showBuffer && (
            <div className="inline-flex items-center gap-1.5">
              <span className="text-text-dim">BUFFER</span>
              <span className="text-neon-yellow">
                {bufferStatus.sentences}{prebufferModeLabel}/{bufferStatus.seconds.toFixed(1)}s
                <span className="text-text-dim"> · need {bufferStatus.needed}</span>
              </span>
            </div>
          )}
          {queueLength > 0 && (
            <div className="inline-flex items-center gap-1.5">
              <span className="text-text-dim">QUEUE</span>
              <span className="text-neon-cyan">{queueLength}</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        /* Volume slider thumb — pseudo-elements are awkward in Tailwind.
           Kept here as a small scoped block. */
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--neon-cyan);
          box-shadow: 0 0 8px var(--neon-cyan);
          cursor: pointer;
        }
        .volume-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--neon-cyan);
          box-shadow: 0 0 8px var(--neon-cyan);
          border: none;
          cursor: pointer;
        }
        /* iOS: increase the volume thumb tap area (a 12px thumb is hard
           to grab on touch). The play button min-height is set inline via
           the supports-[-webkit-touch-callout:none]: variant. */
        @supports (-webkit-touch-callout: none) {
          .volume-slider::-webkit-slider-thumb {
            width: 22px;
            height: 22px;
          }
        }
      `}</style>
    </section>
  );
}
