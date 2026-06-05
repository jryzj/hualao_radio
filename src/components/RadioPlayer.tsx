"use client";
import { AudioVisualizer } from "./AudioVisualizer";

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

  return (
    <section className="player" aria-label="Radio player">
      <div className="player-frame">
        <div className="player-corner tl" />
        <div className="player-corner tr" />
        <div className="player-corner bl" />
        <div className="player-corner br" />

        {/* ON AIR badge — color state machine */}
        <div className={`on-air ${isPlaying ? "playing" : "idle"}`} role="status" aria-live="polite">
          <span className="on-air-dot" />
          <span className="on-air-text display">ON AIR</span>
        </div>

        {/* Visualizer ring (centerpiece) */}
        <div className="visualizer-wrap">
          <AudioVisualizer analyser={analyser} isPlaying={isPlaying} barCount={48} />
        </div>

        {/* Station + theme label */}
        <div className="meta">
          <h1 className="station display">{stationName}</h1>
          {theme ? (
            <p className="theme-name mono">
              <span className="theme-prefix">// </span>
              {theme.name}
            </p>
          ) : (
            <p className="theme-name mono">
              <span className="theme-prefix">// </span>initializing signal...
            </p>
          )}
          <p className="host mono">hosted by {hostName}</p>
        </div>

        {/* Transport controls */}
        <div className="transport">
          <button
            className={`play-btn display ${isPlaying ? "playing" : "paused"}`}
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Stop playback" : "Start playback"}
          >
            {isPlaying ? (
              <>
                <span className="play-icon">
                  <span className="bar" />
                  <span className="bar" />
                </span>
                <span>STOP</span>
              </>
            ) : (
              <>
                <span className="play-icon">
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
                    <path d="M2 1 L11 6 L2 11 Z" fill="currentColor" />
                  </svg>
                </span>
                <span>PLAY</span>
              </>
            )}
          </button>

          <div className="volume-group">
            <span className="volume-icon mono" aria-hidden>VOL</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={e => onVolumeChange(parseFloat(e.target.value))}
              className="volume-slider"
              aria-label="Volume"
            />
            <span className="volume-value mono">{Math.round(volume * 100)}</span>
          </div>
        </div>

        {/* Status row */}
        <div className="status-row mono">
          <div className="status-item">
            <span className={`status-dot ${connected ? "ok" : "warn"}`} />
            <span className="status-label">{connected ? "WS_LINK" : "WS_LINK…"}</span>
          </div>
          {isPlaying && !bufferStatus.ready && (
            <div className="status-item buffer">
              <span className="status-label">BUFFER</span>
              <span className="status-value">
                {bufferStatus.sentences}{prebufferModeLabel}/{bufferStatus.seconds.toFixed(1)}s
                <span className="status-dim"> · need {bufferStatus.needed}</span>
              </span>
            </div>
          )}
          {queueLength > 0 && (
            <div className="status-item">
              <span className="status-label">QUEUE</span>
              <span className="status-value">{queueLength}</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .player {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .player-frame {
          position: relative;
          width: 100%;
          max-width: 560px;
          padding: 28px 24px 24px;
          background:
            radial-gradient(ellipse at center top, rgba(0, 240, 255, 0.06) 0%, transparent 50%),
            linear-gradient(160deg, rgba(20, 20, 42, 0.6) 0%, rgba(13, 13, 24, 0.4) 100%);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .player-corner {
          position: absolute;
          width: 14px;
          height: 14px;
          border-color: var(--neon-cyan);
          opacity: 0.7;
        }
        .player-corner.tl { top: 6px; left: 6px; border-top: 1.5px solid; border-left: 1.5px solid; }
        .player-corner.tr { top: 6px; right: 6px; border-top: 1.5px solid; border-right: 1.5px solid; }
        .player-corner.bl { bottom: 6px; left: 6px; border-bottom: 1.5px solid; border-left: 1.5px solid; }
        .player-corner.br { bottom: 6px; right: 6px; border-bottom: 1.5px solid; border-right: 1.5px solid; }

        /* ON AIR badge */
        .on-air {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 14px;
          border-radius: var(--radius-pill);
          font-size: 11px;
          letter-spacing: 0.25em;
          font-weight: 600;
          transition: color 0.3s var(--ease-out), box-shadow 0.3s var(--ease-out), background 0.3s var(--ease-out);
        }
        .on-air.idle {
          color: var(--on-air-idle);
          background: rgba(255, 0, 170, 0.08);
          border: 1px solid var(--border-magenta);
          animation: neon-breathe 2s ease-in-out infinite;
        }
        .on-air.playing {
          color: var(--on-air-red);
          background: rgba(255, 34, 68, 0.12);
          border: 1px solid rgba(255, 34, 68, 0.5);
          animation: on-air-pulse 0.8s ease-in-out infinite;
          text-shadow: 0 0 8px rgba(255, 34, 68, 0.6);
        }
        .on-air-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 8px currentColor;
        }

        .visualizer-wrap {
          width: clamp(180px, 60vw, 320px);
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .meta {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .station {
          font-size: clamp(28px, 6vw, 40px);
          font-weight: 700;
          letter-spacing: 0.18em;
          color: var(--text-primary);
          text-shadow: 0 0 18px rgba(0, 240, 255, 0.25);
          margin: 0;
        }
        .theme-name {
          font-size: 13px;
          color: var(--neon-cyan);
          margin: 0;
          letter-spacing: 0.05em;
        }
        .theme-prefix { color: var(--text-dim); }
        .host {
          font-size: 11px;
          color: var(--text-secondary);
          margin: 0;
          letter-spacing: 0.08em;
        }

        .transport {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
          justify-content: center;
          width: 100%;
        }
        .play-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 28px;
          border: 1.5px solid var(--neon-cyan);
          background: rgba(0, 240, 255, 0.05);
          color: var(--neon-cyan);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.2em;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.25s var(--ease-out);
          box-shadow: 0 0 12px rgba(0, 240, 255, 0.2), inset 0 0 12px rgba(0, 240, 255, 0.05);
        }
        .play-btn:hover {
          background: rgba(0, 240, 255, 0.12);
          box-shadow: 0 0 24px rgba(0, 240, 255, 0.4), inset 0 0 18px rgba(0, 240, 255, 0.1);
          transform: translateY(-1px);
        }
        .play-btn.playing {
          border-color: var(--on-air-red);
          color: var(--on-air-red);
          background: rgba(255, 34, 68, 0.08);
          box-shadow: 0 0 12px rgba(255, 34, 68, 0.3), inset 0 0 12px rgba(255, 34, 68, 0.05);
        }
        .play-btn.playing:hover {
          background: rgba(255, 34, 68, 0.15);
          box-shadow: 0 0 24px rgba(255, 34, 68, 0.5), inset 0 0 18px rgba(255, 34, 68, 0.1);
        }
        .play-icon {
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .play-icon .bar {
          display: inline-block;
          width: 3px;
          height: 12px;
          background: currentColor;
          border-radius: 1px;
        }

        .volume-group {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
        }
        .volume-icon {
          font-size: 9px;
          color: var(--text-dim);
          letter-spacing: 0.15em;
        }
        .volume-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 80px;
          height: 3px;
          background: var(--bg-elevated);
          border-radius: 2px;
          cursor: pointer;
          outline: none;
        }
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
        .volume-value {
          font-size: 10px;
          color: var(--neon-cyan);
          min-width: 24px;
          text-align: right;
        }

        .status-row {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
          font-size: 10px;
          letter-spacing: 0.1em;
          color: var(--text-dim);
        }
        .status-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
        }
        .status-dot.ok { background: var(--on-air-red); box-shadow: 0 0 4px var(--on-air-red); animation: neon-breathe 1.4s ease-in-out infinite; }
        .status-dot.warn { background: var(--neon-yellow); box-shadow: 0 0 4px var(--neon-yellow); }
        .status-label { color: var(--text-dim); }
        .status-value { color: var(--neon-cyan); }
        .status-dim { color: var(--text-dim); }
        .status-item.buffer .status-value { color: var(--neon-yellow); }

        @media (max-width: 480px) {
          .player-frame { padding: 20px 16px 16px; }
          .volume-slider { width: 60px; }
        }
        @media (max-width: 380px) {
          .player-frame { padding: 16px 12px 12px; gap: 12px; }
          .visualizer-wrap { width: clamp(160px, 70vw, 220px); }
          .station { font-size: 22px; letter-spacing: 0.12em; }
          .play-btn { padding: 10px 20px; font-size: 12px; }
        }
        /* === Tablet portrait (>= 768px) === */
        @media (min-width: 768px) {
          .player-frame { max-width: 640px; padding: 32px 32px 28px; gap: 20px; }
          .visualizer-wrap { width: clamp(280px, 48vw, 380px); }
          .station { font-size: clamp(36px, 5vw, 48px); }
          .theme-name { font-size: 14px; }
          .host { font-size: 12px; }
          .on-air { padding: 6px 16px; font-size: 12px; }
          .play-btn { padding: 13px 32px; font-size: 13px; }
          .volume-group { padding: 10px 16px; gap: 12px; }
          .volume-slider { width: 100px; }
          .volume-value { font-size: 11px; }
          .status-row { font-size: 11px; gap: 18px; }
        }
        /* === Tablet landscape / small desktop (>= 1024px) === */
        @media (min-width: 1024px) {
          .player-frame { max-width: 580px; padding: 36px 36px 32px; gap: 22px; }
          .visualizer-wrap { width: clamp(300px, 30vw, 400px); }
          .station { font-size: clamp(40px, 4.5vw, 56px); letter-spacing: 0.22em; }
          .theme-name { font-size: 15px; }
          .host { font-size: 13px; }
          .on-air { padding: 7px 18px; font-size: 13px; letter-spacing: 0.3em; }
          .play-btn { padding: 14px 36px; font-size: 14px; }
          .volume-group { padding: 11px 18px; gap: 14px; }
          .volume-slider { width: 120px; }
          .volume-value { font-size: 12px; min-width: 28px; }
          .status-row { font-size: 12px; gap: 20px; }
        }
        /* === Wide desktop (>= 1366px) === */
        @media (min-width: 1366px) {
          .player-frame { max-width: 640px; padding: 44px 40px 36px; gap: 24px; }
          .visualizer-wrap { width: clamp(340px, 28vw, 440px); }
          .station { font-size: clamp(44px, 4vw, 60px); }
        }
        @media (orientation: landscape) and (max-height: 500px) {
          .player-frame { padding: 12px 14px; gap: 8px; }
          .visualizer-wrap { width: clamp(120px, 30vh, 200px); }
          .station { font-size: 18px; letter-spacing: 0.12em; }
          .theme-name { font-size: 11px; }
          .host { font-size: 10px; }
          .on-air { padding: 3px 10px; font-size: 9px; letter-spacing: 0.2em; }
          .play-btn { padding: 8px 16px; font-size: 11px; }
          .volume-group { padding: 4px 10px; }
          .volume-slider { width: 60px; }
          .status-row { gap: 10px; font-size: 9px; }
        }
        @media (orientation: landscape) and (max-height: 420px) {
          .player-frame { padding: 8px 12px; gap: 6px; }
          .visualizer-wrap { width: clamp(100px, 25vh, 160px); }
          .meta { gap: 0; }
          .station { font-size: 16px; }
          .host { display: none; }
        }

        /* iOS: increase volume slider tap area, native styling for thumb */
        @supports (-webkit-touch-callout: none) {
          .volume-slider { height: 6px; }
          .volume-slider::-webkit-slider-thumb { width: 22px; height: 22px; }
          .play-btn { min-height: 44px; }
        }
      `}</style>
    </section>
  );
}
