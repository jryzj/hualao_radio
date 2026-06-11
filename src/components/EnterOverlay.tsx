"use client";

interface Props {
  onEnter: () => void;
  visible: boolean;
}

// First-visit overlay. Browsers (especially iOS Safari) block autoplay until
// a user gesture occurs, so we need at least one tap to:
//   1) create the AudioContext
//   2) call audioContext.resume()
//   3) connect the audio element to the analyser
// The visual is a centered neon button with subtle pulse — it disappears
// immediately on click so it doesn't block subsequent interactions.
//
// Tailwind v4 migration: the previous 80-line <style> block is gone.
// All keyframes (ring-spin, ring-spin-reverse, neon-breathe) are now
// global `animate-*` utilities; all design tokens come from the @theme
// block in src/styles/globals.css. The radial gradient overlay uses
// Tailwind's arbitrary-value syntax for the multi-stop background.
export function EnterOverlay({ onEnter, visible }: Props) {
  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enter RadioAI"
      className="fixed inset-0 z-[100] flex animate-fade-in items-center justify-center p-6 [background:radial-gradient(ellipse_at_center,rgba(20,20,42,0.92)_0%,rgba(5,5,9,0.98)_70%),linear-gradient(180deg,#050509_0%,#0d0d18_100%)]"
    >
      <div className="flex max-w-[480px] flex-col items-center gap-5 text-center landscape-short:gap-3 max-sm:gap-3">
        <div
          aria-hidden
          className="relative flex h-[120px] w-[120px] items-center justify-center max-[360px]:h-[90px] max-[360px]:w-[90px] landscape-short:h-16 landscape-short:w-16"
        >
          <span className="absolute inset-0 rounded-full border border-dashed border-neon-cyan opacity-70 animate-ring-spin" />
          <span className="absolute inset-3 rounded-full border border-neon-magenta opacity-70 animate-[ring-spin-reverse_12s_linear_infinite] max-[360px]:inset-[9px] landscape-short:inset-2" />
          <span className="absolute inset-6 rounded-full border border-neon-violet opacity-70 animate-[neon-breathe_2s_ease-in-out_infinite] max-[360px]:inset-[18px] landscape-short:inset-4" />
          <span className="h-5 w-5 rounded-full bg-neon-cyan animate-[neon-breathe_1.4s_ease-in-out_infinite] [box-shadow:0_0_24px_#00f0ff,0_0_48px_rgba(0,240,255,0.4)] max-[360px]:h-4 max-[360px]:w-4 landscape-short:h-3.5 landscape-short:w-3.5" />
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-neon-cyan opacity-70">
          [ signal.lock ]
        </div>
        <h1 className="m-0 font-bold tracking-[0.18em] text-text-primary [font-size:clamp(40px,9vw,64px)] [text-shadow:0_0_24px_rgba(0,240,255,0.3)] max-sm:tracking-[0.1em] max-[360px]:[font-size:clamp(32px,10vw,48px)] landscape-short:text-[28px] landscape-short:tracking-[0.12em]">
          RADIO AI
        </h1>
        <p className="m-0 font-mono text-[12px] tracking-[0.1em] text-text-secondary landscape-short:text-[11px]">
          live signal · ai-driven broadcast
        </p>
        <button
          type="button"
          onClick={onEnter}
          autoFocus
          // iOS 14.6 (iPhone 7) touch-event fix. The parent uses
          // `fixed inset-0 z-[100]`, but the buttons are static-
          // positioned children — on iOS Safari 14.6 the z-index
          // does NOT propagate to static children, so a sibling
          // composited layer (the radial-gradient overlay itself,
          // since gradient + fixed positioning promotes it to its
          // own layer) can swallow the first tap. Giving the
          // button its own stacking context via position+zIndex
          // guarantees the gesture lands on the handler.
          style={{ position: "relative", zIndex: 1 }}
          className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border-[1.5px] border-neon-cyan bg-transparent px-8 py-4 text-sm font-medium uppercase tracking-[0.18em] text-neon-cyan transition-all [box-shadow:0_0_16px_rgba(0,240,255,0.2),inset_0_0_16px_rgba(0,240,255,0.05)] hover:-translate-y-0.5 hover:bg-[rgba(0,240,255,0.08)] hover:[box-shadow:0_0_32px_rgba(0,240,255,0.4),inset_0_0_24px_rgba(0,240,255,0.1)] active:translate-y-0 max-sm:px-5 max-sm:py-3.5 max-sm:text-xs max-sm:tracking-[0.12em] landscape-short:px-[18px] landscape-short:py-2.5 landscape-short:text-[11px]"
        >
          <span className="text-neon-magenta opacity-70">[</span>
          <span>TAP TO ENTER THE FREQUENCY</span>
          <span className="text-neon-magenta opacity-70">]</span>
        </button>
        <p className="m-0 max-w-[320px] font-mono text-[10px] leading-[1.5] tracking-[0.08em] text-text-dim landscape-short:text-[9px]">
          audio requires user gesture to comply with browser autoplay policy
        </p>
      </div>
    </div>
  );
}
