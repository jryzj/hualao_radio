"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  barCount?: number;
}

// All circular elements — the FFT orbit, the SVG rings, the center
// dot, the ripple origin — share one geometric center, the wrapper's
// content-box center. The SVG viewBox is 100x100 with the default
// preserveAspectRatio=xMidYMid meet; on a square wrapper, its (50,50)
// point maps to the wrapper's geometric center. The FFT is drawn on a
// canvas that fills the wrapper, with cx=w/2, cy=h/2 — the same point.
// So the bars and the rings are forced to be concentric regardless of
// the wrapper's rendered size.
//
// To make the concentricity obvious at a glance the SVG carries:
//   - a small filled center dot (the explicit "core" of the visualizer)
//   - a radial cyan glow around the dot
//   - an inner ring that sits exactly on the FFT orbit (low-opacity
//     "track" so the user can see the bars ride a single circle)
//   - an outer dashed gradient ring (rotates when playing)
//   - a static outermost frame ring
//   - 4 cardinal tick marks
//
// Geometry, expressed as ratios of the wrapper's smaller CSS dimension
// (minDim). The wrapper enforces 1:1 aspect via `aspect-square`; on
// the rare case the parent provides a non-square box, minDim is the
// smaller side and all radii scale against it so nothing overflows.
const FFT_ORBIT_RATIO = 0.30;   // r / minDim — inner end of each bar
const FFT_BAR_GAP = 0.018;      // r / minDim — gap from orbit ring to bar start
const FFT_BAR_MIN = 0.010;      // r / minDim — minimum bar length (silent)
const FFT_BAR_MAX = 0.140;      // r / minDim — maximum bar length (peak)
const BAR_WIDTH_REF = 280;      // wrapper CSS px at which lineWidth is "1x"

export function AudioVisualizer({ analyser, isPlaying, barCount = 48 }: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // Track the actual rendered size of the wrapper. We use a ref (not
  // state) so the rAF tick can read it without re-rendering, and a
  // tiny state counter to re-render the static SVG rings on resize.
  const sizeRef = useRef<{ w: number; h: number; dpr: number } | null>(null);
  const [, forceRender] = useState(0);

  // === ResizeObserver: track actual rendered size =================
  // clientWidth/clientHeight read from inside a useEffect can be stale
  // (the layout hasn't run yet) or wrong (the parent reflowed but the
  // effect didn't re-fire). A ResizeObserver on the wrapper is the
  // only reliable way to react to orientation changes, window resizes,
  // and parent relayouts.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const update = () => {
      const rect = wrapper.getBoundingClientRect();
      sizeRef.current = {
        w: rect.width,
        h: rect.height,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      };
      forceRender((n) => n + 1);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      window.addEventListener("orientationchange", update);
      return () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("orientationchange", update);
      };
    }
    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // === Analyser buffer: allocate once when analyser is ready ======
  useEffect(() => {
    if (!analyser) return;
    const buf = new ArrayBuffer(analyser.frequencyBinCount);
    dataRef.current = new Uint8Array(buf) as Uint8Array<ArrayBuffer>;
  }, [analyser]);

  // === Canvas rAF loop: draw FFT bars when playing ================
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ResizeObserver has populated sizeRef; if the wrapper still has
    // no size (e.g. display:none ancestor), bail — the next
    // ResizeObserver fire will retry.
    const size = sizeRef.current;
    if (!size) return;
    const { w, h, dpr } = size;
    if (w === 0 || h === 0) return;
    const minDim = Math.min(w, h);
    // FFT center = wrapper geometric center. SVG (50,50) in a 100x100
    // viewBox under xMidYMid meet (default) maps to the same point.
    const cx = w / 2;
    const cy = h / 2;

    // Back the canvas at device pixel resolution. Using the full
    // wrapper (not minDim) so the clearRect below wipes the whole
    // drawn area, not just a centered square.
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform before scale
    ctx.scale(dpr, dpr);

    const data: Uint8Array<ArrayBuffer> | null = analyser
      ? (dataRef.current ?? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) as Uint8Array<ArrayBuffer>)
      : null;
    if (data) dataRef.current = data;

    const orbitR = minDim * FFT_ORBIT_RATIO;
    const barInnerR = orbitR + minDim * FFT_BAR_GAP;
    const barMin = minDim * FFT_BAR_MIN;
    const barMax = minDim * FFT_BAR_MAX;

    const tick = (now = performance.now()) => {
      if (analyser && data) {
        analyser.getByteFrequencyData(data);
      }
      ctx.clearRect(0, 0, w, h);

      const barWidthScale = minDim / BAR_WIDTH_REF;
      for (let i = 0; i < barCount; i++) {
        // Sample with slight bias toward bass (lower 60% of frequencies)
        const idx = data ? Math.floor(Math.pow(i / barCount, 1.4) * data.length * 0.6) : 0;
        const synthetic = 0.18 + 0.16 * Math.sin(now / 280 + i * 0.55) + 0.08 * Math.sin(now / 760 + i * 0.13);
        const v = data ? data[idx] / 255 : Math.max(0.08, Math.min(0.42, synthetic));
        const barH = barMin + v * (barMax - barMin);
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;

        const x1 = cx + Math.cos(angle) * barInnerR;
        const y1 = cy + Math.sin(angle) * barInnerR;
        const x2 = cx + Math.cos(angle) * (barInnerR + barH);
        const y2 = cy + Math.sin(angle) * (barInnerR + barH);

        // Color gradient: cyan (low) → magenta (mid) → yellow (high)
        const hue = 180 + v * 120;
        const color = `hsl(${hue}, 100%, ${50 + v * 15}%)`;

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, 2.5 * barWidthScale);
        ctx.lineCap = "round";
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 + v * 12;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, analyser, barCount]);

  return (
    <div
      ref={wrapperRef}
      className="relative aspect-square w-full overflow-hidden"
      aria-hidden
    >
      {/* CSS ripples — emanate from the geometric center */}
      {isPlaying && (
        <div className="pointer-events-none absolute inset-0">
          <span
            className="absolute left-1/2 top-1/2 h-3/5 w-3/5 rounded-full border-[1.5px] border-neon-cyan opacity-0 animate-[ripple_3.2s_ease-out_infinite] will-change-[transform,opacity]"
            style={{ transform: "translate(-50%, -50%)" }}
          />
          <span
            className="absolute left-1/2 top-1/2 h-3/5 w-3/5 rounded-full border-[1.5px] border-neon-magenta opacity-0 animate-[ripple_3.2s_ease-out_1.6s_infinite] will-change-[transform,opacity]"
            style={{ transform: "translate(-50%, -50%)" }}
          />
        </div>
      )}

      {/* SVG rings — all centered at viewBox (50,50), which maps to
          the wrapper's geometric center. preserveAspectRatio defaults
          to xMidYMid meet; on the 1:1 wrapper the (50,50) point lands
          at the same (w/2, h/2) the FFT uses. */}
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0"
      >
        <defs>
          <radialGradient id="av-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--neon-cyan)" stopOpacity="0.9" />
            <stop offset="55%" stopColor="var(--neon-cyan)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--neon-cyan)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="av-ring-outer" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--neon-cyan)" />
            <stop offset="100%" stopColor="var(--neon-violet)" />
          </linearGradient>
          <linearGradient id="av-ring-inner" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--neon-magenta)" />
            <stop offset="100%" stopColor="var(--neon-pink)" />
          </linearGradient>
        </defs>

        {/* Outermost frame ring — static, dashed, low opacity */}
        <circle
          cx="50" cy="50" r="47"
          fill="none"
          stroke="url(#av-ring-outer)"
          strokeWidth="0.25"
          strokeDasharray="1 3"
          opacity="0.45"
        />
        {/* Outer ring — rotates clockwise when playing */}
        <circle
          cx="50" cy="50" r="42"
          fill="none"
          stroke="url(#av-ring-outer)"
          strokeWidth="0.4"
          strokeDasharray="1.5 2.5"
          opacity="0.75"
          className={isPlaying ? "origin-center animate-[ring-spin_18s_linear_infinite]" : "origin-center"}
          style={{ transformOrigin: "50% 50%" }}
        />
        {/* Inner ring — coincides with the FFT orbit (r=30 viewBox =
           0.30 of minDim). Low-opacity "track" so the user can see
           the bars sit on a single concentric circle. */}
        <circle
          cx="50" cy="50" r="30"
          fill="none"
          stroke="var(--neon-cyan)"
          strokeWidth="0.2"
          strokeDasharray="0.4 1.2"
          opacity="0.45"
        />
        {/* Pulse ring — additional concentric layer, breathes */}
        <circle
          cx="50" cy="50" r="18"
          fill="none"
          stroke="url(#av-ring-inner)"
          strokeWidth="0.4"
          opacity="0.55"
          className={isPlaying ? "origin-center animate-[neon-breathe_1.6s_ease-in-out_infinite]" : "origin-center"}
          style={{ transformOrigin: "50% 50%" }}
        />
        {/* Center glow */}
        <circle cx="50" cy="50" r="6" fill="url(#av-core-glow)" />
        {/* Center dot — the explicit concentric marker. Always drawn
           at viewBox (50,50) so the eye can verify the center. */}
        <circle
          cx="50" cy="50" r="0.9"
          fill="var(--neon-cyan)"
          opacity="0.95"
        />
        {/* Edge tick marks at 4 cardinals — frame the visualizer */}
        <g opacity="0.45" stroke="var(--neon-cyan)" strokeWidth="0.3">
          <line x1="50" y1="1" x2="50" y2="3.5" />
          <line x1="50" y1="96.5" x2="50" y2="99" />
          <line x1="1" y1="50" x2="3.5" y2="50" />
          <line x1="96.5" y1="50" x2="99" y2="50" />
        </g>
      </svg>

      {/* FFT bars canvas — drawn on top of the SVG so the bars
          appear to orbit on the inner ring */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
      />
    </div>
  );
}
