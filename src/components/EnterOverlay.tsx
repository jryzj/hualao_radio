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
export function EnterOverlay({ onEnter, visible }: Props) {
  if (!visible) return null;

  return (
    <div className="enter-overlay" role="dialog" aria-modal="true" aria-label="Enter RadioAI">
      <div className="enter-stack">
        <div className="enter-glyph" aria-hidden>
          <span className="enter-ring r1" />
          <span className="enter-ring r2" />
          <span className="enter-ring r3" />
          <span className="enter-core" />
        </div>
        <div className="enter-bracket mono">[ signal.lock ]</div>
        <h1 className="enter-title display">RADIO AI</h1>
        <p className="enter-sub mono">live signal · ai-driven broadcast</p>
        <button className="enter-btn display" onClick={onEnter} autoFocus>
          <span className="enter-btn-bracket">[</span>
          <span className="enter-btn-text">TAP TO ENTER THE FREQUENCY</span>
          <span className="enter-btn-bracket">]</span>
        </button>
        <p className="enter-hint mono">audio requires user gesture to comply with browser autoplay policy</p>
      </div>

      <style>{`
        .enter-overlay {
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse at center, rgba(20, 20, 42, 0.92) 0%, rgba(5, 5, 9, 0.98) 70%),
            linear-gradient(180deg, #050509 0%, #0d0d18 100%);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: fade-in 0.4s var(--ease-out);
        }
        .enter-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          max-width: 480px;
          text-align: center;
        }
        .enter-glyph {
          position: relative;
          width: 120px;
          height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .enter-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid var(--neon-cyan);
          opacity: 0.7;
        }
        .enter-ring.r1 { animation: ring-spin 8s linear infinite; border-style: dashed; border-color: var(--neon-cyan); }
        .enter-ring.r2 { animation: ring-spin-reverse 12s linear infinite; inset: 12px; border-color: var(--neon-magenta); }
        .enter-ring.r3 { animation: neon-breathe 2s ease-in-out infinite; inset: 24px; border-color: var(--neon-violet); }
        .enter-core {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--neon-cyan);
          box-shadow: 0 0 24px var(--neon-cyan), 0 0 48px rgba(0, 240, 255, 0.4);
          animation: neon-breathe 1.4s ease-in-out infinite;
        }
        .enter-bracket {
          font-size: 11px;
          letter-spacing: 0.2em;
          color: var(--neon-cyan);
          text-transform: uppercase;
          opacity: 0.7;
        }
        .enter-title {
          font-size: clamp(40px, 9vw, 64px);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.18em;
          margin: 0;
          text-shadow: 0 0 24px rgba(0, 240, 255, 0.3);
        }
        .enter-sub {
          font-size: 12px;
          color: var(--text-secondary);
          letter-spacing: 0.1em;
          margin: 0;
        }
        .enter-btn {
          margin-top: 8px;
          padding: 16px 32px;
          background: transparent;
          border: 1.5px solid var(--neon-cyan);
          color: var(--neon-cyan);
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.18em;
          border-radius: var(--radius-md);
          cursor: pointer;
          text-transform: uppercase;
          position: relative;
          transition: all 0.25s var(--ease-out);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 0 16px rgba(0, 240, 255, 0.2), inset 0 0 16px rgba(0, 240, 255, 0.05);
        }
        .enter-btn:hover {
          background: rgba(0, 240, 255, 0.08);
          box-shadow: 0 0 32px rgba(0, 240, 255, 0.4), inset 0 0 24px rgba(0, 240, 255, 0.1);
          transform: translateY(-2px);
        }
        .enter-btn:active { transform: translateY(0); }
        .enter-btn-bracket { color: var(--neon-magenta); opacity: 0.7; }
        .enter-hint {
          font-size: 10px;
          color: var(--text-dim);
          letter-spacing: 0.08em;
          max-width: 320px;
          line-height: 1.5;
          margin: 0;
        }
        @media (max-width: 480px) {
          .enter-title { letter-spacing: 0.1em; }
          .enter-btn { padding: 14px 20px; font-size: 12px; letter-spacing: 0.12em; }
        }
        @media (max-width: 360px) {
          .enter-glyph { width: 90px; height: 90px; }
          .enter-glyph .enter-ring.r2 { inset: 9px; }
          .enter-glyph .enter-ring.r3 { inset: 18px; }
          .enter-glyph .enter-core { width: 16px; height: 16px; }
          .enter-title { font-size: clamp(32px, 10vw, 48px); }
        }
        @media (orientation: landscape) and (max-height: 500px) {
          .enter-stack { gap: 12px; }
          .enter-glyph { width: 64px; height: 64px; }
          .enter-glyph .enter-ring.r2 { inset: 8px; }
          .enter-glyph .enter-ring.r3 { inset: 16px; }
          .enter-glyph .enter-core { width: 14px; height: 14px; }
          .enter-title { font-size: 28px; letter-spacing: 0.12em; }
          .enter-sub { font-size: 11px; }
          .enter-btn { padding: 10px 18px; font-size: 11px; }
          .enter-hint { font-size: 9px; }
        }
      `}</style>
    </div>
  );
}
