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

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 0, height: 0 };
  }
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MinimalRadioPlayer({
  theme,
  isPlaying,
  queueLength,
  analyser,
  onTogglePlay,
}: Props) {
  const [now, setNow] = useState<Date | null>(null);
  // Start at {0,0} on both server and client so the first render matches.
  // The real viewport is read in the effect below (runs only in the browser).
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const tick = () => setNow(new Date());
    const startId = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewport(getViewportSize());
    updateViewport();
    const vv = window.visualViewport;
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    vv?.addEventListener("resize", updateViewport);
    vv?.addEventListener("scroll", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      vv?.removeEventListener("resize", updateViewport);
      vv?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  const hostName = theme?.persona?.name ?? "AI";
  const isLandscape = viewport.width > viewport.height;
  const isSmallPhone = viewport.width > 0 && viewport.width <= 430;
  const reservedHeight = isLandscape ? 64 : isSmallPhone ? 84 : 108;
  const availableHeight = viewport.height > 0
    ? Math.max(viewport.height - reservedHeight, isLandscape ? 220 : 420)
    : undefined;
  const sectionStyle = availableHeight ? { minHeight: `${availableHeight}px`, height: `${availableHeight}px` } : undefined;
  const stageMinHeight = isLandscape ? 188 : isSmallPhone ? 176 : 220;
  const stageHeight = availableHeight
    ? Math.max(Math.floor(availableHeight * (isLandscape ? 0.62 : 0.56)), stageMinHeight)
    : undefined;

  return (
    <section
      style={sectionStyle}
      className="flex w-full items-center justify-center px-2 py-2 sm:px-4 sm:py-3 md:px-6 md:py-4 max-xs:px-2 max-xs:py-1.5 landscape-short:px-2 landscape-short:py-1"
    >
      <div className="grid h-full w-full max-w-[1200px] gap-2.5 max-xs:gap-2 landscape-short:grid-cols-[minmax(240px,0.94fr)_minmax(220px,1.06fr)] landscape-short:gap-2 lg:grid-cols-[minmax(360px,0.92fr)_minmax(380px,1.08fr)] lg:gap-4">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,249,252,0.88))] p-3 backdrop-blur-[18px] sm:rounded-[28px] sm:p-4 lg:p-5 max-xs:rounded-[18px] max-xs:p-2.5 landscape-short:rounded-[20px] landscape-short:p-2.5">
          <div className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(95,144,197,0.24),transparent)]" />
          <div className="absolute -left-12 top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(95,144,197,0.16),rgba(95,144,197,0))]" />
          <div className="absolute right-0 top-0 h-32 w-32 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.85),rgba(255,255,255,0))]" />

          <div className="relative flex items-start justify-between gap-3 max-xs:gap-2 landscape-short:gap-2.5">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-2.5 py-1 max-xs:px-2 max-xs:py-0.5 landscape-short:px-2 landscape-short:py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5f90c5]" />
                <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-[#8b99ae] sm:text-[10px] max-xs:text-[8px] landscape-short:text-[8px]">
                  Live radio
                </span>
              </div>
              <h1 className="mt-2.5 font-display text-[clamp(28px,5.2vw,54px)] font-semibold leading-[0.92] tracking-[-0.06em] text-[#213047] max-xs:mt-2 max-xs:text-[clamp(24px,7vw,30px)] landscape-short:mt-2 landscape-short:text-[clamp(22px,3.6vw,30px)]">
                RadioAI
              </h1>
            </div>
            <div className="flex-none rounded-[16px] bg-white/80 px-2.5 py-1.5 text-right max-xs:rounded-[12px] max-xs:px-2 max-xs:py-1 landscape-short:rounded-[14px] landscape-short:px-2.5 landscape-short:py-1.5">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#8b99ae] sm:text-[10px] max-xs:text-[8px] landscape-short:text-[8px]">
                Local time
              </div>
              <div className="mt-1 font-display text-[17px] font-medium tracking-[-0.03em] text-[#213047] sm:text-[20px] max-xs:text-[14px] landscape-short:text-[16px]">
                {now ? formatClock(now) : "--:--"}
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex-1 space-y-2 sm:mt-5 sm:space-y-3 max-xs:mt-3 max-xs:space-y-1.5 landscape-short:mt-3 landscape-short:space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_80px] gap-1.5 sm:gap-2.5 max-xs:grid-cols-[minmax(0,1fr)_72px] landscape-short:grid-cols-[minmax(0,1fr)_76px] landscape-short:gap-1.5">
              <div className="min-w-0 rounded-[16px] bg-white/82 px-2.5 py-2 sm:px-3.5 sm:py-3 max-xs:rounded-[14px] max-xs:px-2.5 max-xs:py-1.5 landscape-short:rounded-[14px] landscape-short:px-2.5 landscape-short:py-2">
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#8b99ae] sm:text-[10px] max-xs:text-[8px] landscape-short:text-[8px]">
                  Host
                </div>
                <div className="mt-1 truncate text-[13px] font-medium text-[#213047] sm:text-[15px] md:text-base max-xs:text-[12px] landscape-short:text-[13px]">
                  {hostName}
                </div>
              </div>

              <div className="rounded-[16px] bg-white/82 px-2 py-2 text-center sm:px-3 sm:py-3 max-xs:rounded-[14px] max-xs:px-2 max-xs:py-1.5 landscape-short:rounded-[14px] landscape-short:px-2 landscape-short:py-2">
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#8b99ae] sm:text-[10px] max-xs:text-[8px] landscape-short:text-[8px]">
                  Queue
                </div>
                <div className="mt-1 text-[13px] font-medium text-[#213047] sm:text-[15px] md:text-base max-xs:text-[12px] landscape-short:text-[13px]">
                  {queueLength}
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="relative flex h-full flex-col overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(255,255,255,0.52))] p-2 backdrop-blur-[20px] sm:rounded-[28px] sm:p-3.5 lg:p-5 max-xs:rounded-[18px] max-xs:p-2 landscape-short:rounded-[20px] landscape-short:p-2">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.98),rgba(255,255,255,0)_34%),radial-gradient(circle_at_50%_56%,rgba(95,144,197,0.16),rgba(95,144,197,0)_58%)]" />
          <div className="absolute left-1/2 top-[28%] h-36 w-36 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(95,144,197,0.18),rgba(95,144,197,0))] blur-[8px] sm:h-52 sm:w-52 max-xs:h-28 max-xs:w-28 landscape-short:h-28 landscape-short:w-28" />
          <div
            style={stageHeight ? { minHeight: `${stageHeight}px`, height: `${stageHeight}px` } : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-3 sm:gap-5 max-xs:gap-2.5 landscape-short:gap-2.5"
          >
            <div className="relative w-full max-w-[260px] sm:max-w-[380px] lg:max-w-[440px] max-xs:max-w-[180px] landscape-short:max-w-[180px]">
              <div className="absolute inset-x-[14%] bottom-[8%] h-10 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(95,144,197,0.18),rgba(95,144,197,0))] blur-[10px]" />
              <AudioVisualizer analyser={analyser} isPlaying={isPlaying} barCount={48} />
            </div>

            <button
              type="button"
              onClick={onTogglePlay}
              // iOS Safari hit-test fix (same pattern as the FABs in
              // src/app/page.tsx and the EnterOverlay button):
              // the right column has `backdrop-blur-[20px]`, which
              // promotes the whole column to a GPU composited layer.
              // Inside that layer, static-positioned descendants lose
              // hit-testing on iOS Safari — taps that visually land
              // on the button are swallowed by the parent's composited
              // layer. Giving the button its own stacking context via
              // `position: relative; zIndex: 1` lifts it out so the
              // click reaches the handler. DevTools' mobile emulation
              // doesn't reproduce this, so it only shows up on real
              // devices.
              style={{ position: "relative", zIndex: 1 }}
              className={cn(
                "inline-flex min-h-[42px] min-w-[116px] items-center justify-center rounded-full px-4 text-[15px] font-semibold tracking-[0.12em] transition-all duration-200 sm:min-h-[46px] sm:min-w-[136px] sm:px-6 sm:text-[16px] md:min-h-[50px] md:min-w-[150px] md:text-[18px] max-xs:min-h-[36px] max-xs:min-w-[102px] max-xs:px-3.5 max-xs:text-[13px] landscape-short:min-h-[38px] landscape-short:min-w-[108px] landscape-short:px-4 landscape-short:text-[14px]",
                isPlaying
                  ? "bg-[#213047] text-white [box-shadow:0_0_0_2px_rgba(255,255,255,0.55),inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-[#1a2637]"
                  : "bg-[#5f90c5] text-white [box-shadow:0_0_0_2px_rgba(49,85,127,0.9),inset_0_0_0_1px_rgba(255,255,255,0.12)] hover:bg-[#537fad]",
              )}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
