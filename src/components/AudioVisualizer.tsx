"use client";
import { useEffect, useRef } from "react";

interface Props {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  size?: number;
  barCount?: number;
}

// Multi-effect audio visualizer:
//   - 3 concentric SVG rings (rotating, dashed)
//   - 48 FFT bars on a circular canvas around the rings
//   - 2 CSS ripples emanating from center
// The FFT loop is driven by requestAnimationFrame; we never setState per
// frame — we draw directly to canvas. This keeps React out of the hot path.
//
// Tailwind v4 migration: the 35-line <style> block is gone. Per-element
// animation durations (16s / 22s / 1.6s for the rings, 3.2s for the
// ripples) are expressed as Tailwind arbitrary values where they
// differ from the @theme defaults.
export function AudioVisualizer({ analyser, isPlaying, size, barCount = 48 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Set up analyser buffer once the analyser is ready
  useEffect(() => {
    if (!analyser) return;
    const buf = new ArrayBuffer(analyser.frequencyBinCount);
    dataRef.current = new Uint8Array(buf) as Uint8Array<ArrayBuffer>;
  }, [analyser]);

  // Drive canvas — only while playing AND analyser ready
  useEffect(() => {
    if (!isPlaying || !analyser) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Clear canvas when stopped
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

    // Resolve actual size from canvas clientWidth if no explicit size was passed
    const cssSize = size ?? Math.max(160, Math.min(canvas.clientWidth, canvas.clientHeight) || 320);

    // Handle high-DPI
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== cssSize * dpr || canvas.height !== cssSize * dpr) {
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform before scale
    ctx.scale(dpr, dpr);

    const data: Uint8Array<ArrayBuffer> = dataRef.current
      ?? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    dataRef.current = data;

    const radius = cssSize * 0.32;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, cssSize, cssSize);

      // Draw bars around circle (cx, cy in CSS pixels)
      const cx = cssSize / 2;
      const cy = cssSize / 2;
      const barWidthScale = cssSize / 320;
      for (let i = 0; i < barCount; i++) {
        // Sample with slight bias toward bass (lower 60% of frequencies)
        const idx = Math.floor(Math.pow(i / barCount, 1.4) * data.length * 0.6);
        const v = data[idx] / 255; // 0..1
        const barH = 4 + v * (cssSize * 0.18);
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;

        const x1 = cx + Math.cos(angle) * (radius + 6);
        const y1 = cy + Math.sin(angle) * (radius + 6);
        const x2 = cx + Math.cos(angle) * (radius + 6 + barH);
        const y2 = cy + Math.sin(angle) * (radius + 6 + barH);

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
  }, [isPlaying, analyser, size, barCount]);

  // Outer wrapper fills its parent; canvas inside fills it.
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden>
      {/* CSS ripples — under everything */}
      {isPlaying && (
        <div className="pointer-events-none absolute inset-0">
          <span className="animate-[ripple_3.2s_ease-out_infinite] absolute inset-0 m-auto h-3/5 w-3/5 rounded-full border-[1.5px] border-neon-cyan opacity-0 will-change-[transform,opacity]" />
          <span className="animate-[ripple_3.2s_ease-out_1.6s_infinite] absolute inset-0 m-auto h-3/5 w-3/5 rounded-full border-[1.5px] border-neon-magenta opacity-0 will-change-[transform,opacity]" />
        </div>
      )}

      {/* SVG rings */}
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        className="absolute inset-0"
      >
        <defs>
          <linearGradient id="ring-grad-cyan" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--neon-cyan)" />
            <stop offset="100%" stopColor="var(--neon-violet)" />
          </linearGradient>
          <linearGradient id="ring-grad-magenta" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--neon-magenta)" />
            <stop offset="100%" stopColor="var(--neon-pink)" />
          </linearGradient>
        </defs>

        {/* outer dashed ring — rotates clockwise */}
        <circle
          cx="50" cy="50" r="46"
          fill="none"
          stroke="url(#ring-grad-cyan)"
          strokeWidth="0.4"
          strokeDasharray="2 3"
          opacity="0.7"
          className={isPlaying ? "origin-center animate-[ring-spin_16s_linear_infinite]" : "origin-center"}
        />
        {/* middle dashed ring — rotates counter-clockwise */}
        <circle
          cx="50" cy="50" r="38"
          fill="none"
          stroke="url(#ring-grad-magenta)"
          strokeWidth="0.3"
          strokeDasharray="1 2"
          opacity="0.6"
          className={isPlaying ? "origin-center animate-[ring-spin-reverse_22s_linear_infinite]" : "origin-center"}
        />
        {/* inner solid ring — pulses */}
        <circle
          cx="50" cy="50" r="30"
          fill="none"
          stroke="var(--neon-cyan)"
          strokeWidth="0.6"
          opacity="0.5"
          className={isPlaying ? "origin-center animate-[neon-breathe_1.6s_ease-in-out_infinite]" : "origin-center"}
        />
        {/* innermost glow circle */}
        <circle
          cx="50" cy="50" r="22"
          fill="none"
          stroke="var(--neon-cyan)"
          strokeWidth="0.2"
          opacity="0.3"
        />
        {/* center crosshair tick marks */}
        <g opacity="0.4" stroke="var(--neon-cyan)" strokeWidth="0.3">
          <line x1="50" y1="2" x2="50" y2="4" />
          <line x1="50" y1="96" x2="50" y2="98" />
          <line x1="2" y1="50" x2="4" y2="50" />
          <line x1="96" y1="50" x2="98" y2="50" />
        </g>
      </svg>

      {/* FFT bars canvas */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
      />
    </div>
  );
}
