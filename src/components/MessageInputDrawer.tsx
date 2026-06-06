"use client";
import { useEffect, useRef, useState } from "react";

interface FormState {
  content: string;
  authorName: string;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  onSubmit: (form: FormState) => Promise<void> | void;
  submissionStatus: "idle" | "pending" | "rejected";
}

// Pure input drawer — a translucent bottom sheet that slides up when toggled.
// Independent from MessageWallPanel: the two FABs (input + wall) can be
// open or closed in any combination.
export function MessageInputDrawer({ open, onToggle, onSubmit, submissionStatus }: Props) {
  const [form, setForm] = useState<FormState>({ content: "", authorName: "" });
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.classList.add("drawer-open");
    } else {
      document.body.classList.remove("drawer-open");
    }
    return () => {
      document.body.classList.remove("drawer-open");
    };
  }, [open]);

  // Escape to close + initial focus
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle();
    };
    document.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  // Show success toast for 2s after pending submission
  useEffect(() => {
    if (submissionStatus === "pending") {
      setShowSuccess(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setShowSuccess(false), 2000);
    }
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [submissionStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim()) return;
    await onSubmit(form);
    setForm({ content: "", authorName: "" });
  };

  return (
    <aside
      className={`input-drawer ${open ? "open" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="input-drawer-title"
      aria-hidden={!open}
    >
      <div className="drawer-handle" aria-hidden />
      <div className="drawer-header">
        <div className="drawer-title-wrap">
          <h2 id="input-drawer-title" className="drawer-title display">SEND SIGNAL</h2>
          <span className="drawer-subtitle mono">// audience transmission</span>
        </div>
        <button
          ref={closeBtnRef}
          className="drawer-close"
          onClick={onToggle}
          aria-label="Close input drawer"
        >
          ×
        </button>
      </div>

      <form className="drawer-form" onSubmit={handleSubmit}>
        <input
          className="drawer-input"
          placeholder="your callsign (optional)"
          value={form.authorName}
          onChange={e => setForm({ ...form, authorName: e.target.value })}
          maxLength={32}
          aria-label="Your nickname"
        />
        <div className="drawer-input-row">
          <input
            className="drawer-input flex-1"
            placeholder="transmit your message..."
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            required
            maxLength={500}
            aria-label="Message content"
          />
          <button type="submit" className="drawer-send display">
            SEND →
          </button>
        </div>
        {showSuccess && (
          <div className="drawer-msg success">
            ✓ signal sent — awaiting moderation
          </div>
        )}
        {submissionStatus === "rejected" && (
          <div className="drawer-msg error">
            ✗ signal rejected by moderator
          </div>
        )}
      </form>

      <style>{`
        .input-drawer {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 70;
          max-height: 80vh;
          background: rgba(13, 13, 24, 0.5);
          backdrop-filter: blur(24px) saturate(140%);
          -webkit-backdrop-filter: blur(24px) saturate(140%);
          border-top: 1px solid var(--border-strong);
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
          padding: 8px 20px calc(20px + env(safe-area-inset-bottom, 0px));
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.6);
          transform: translateY(100%);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0.35s;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .input-drawer.open {
          transform: translateY(0);
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transition: transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0s;
        }

        .drawer-handle {
          width: 40px;
          height: 4px;
          background: var(--border-strong);
          border-radius: 2px;
          margin: 0 auto 12px;
        }
        .drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 2px 12px;
          margin-bottom: 12px;
          border-bottom: 1px solid rgba(0, 240, 255, 0.1);
          background: transparent;
        }
        .drawer-title-wrap {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .drawer-title {
          font-size: 16px;
          font-weight: 600;
          letter-spacing: 0.18em;
          color: var(--neon-cyan);
          text-shadow: 0 0 8px rgba(0, 240, 255, 0.4);
          margin: 0;
        }
        .drawer-subtitle {
          font-size: 10px;
          color: var(--text-dim);
          letter-spacing: 0.1em;
        }
        .drawer-close {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-secondary);
          font-size: 22px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s var(--ease-out);
        }
        .drawer-close:hover {
          background: rgba(255, 0, 170, 0.1);
          border-color: var(--border-magenta);
          color: var(--neon-magenta);
        }

        .drawer-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .drawer-input {
          padding: 12px 14px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          /* 16px minimum on iOS — anything smaller and Safari auto-zooms
             the viewport on focus, breaking the layout. */
          font-size: 16px;
          font-family: var(--font-body);
          transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
        }
        .drawer-input::placeholder { color: var(--text-dim); }
        .drawer-input:focus {
          border-color: var(--neon-cyan);
          box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.15);
          outline: none;
        }
        .drawer-input-row {
          display: flex;
          gap: 8px;
        }
        .drawer-input-row .flex-1 { flex: 1; min-width: 0; }
        .drawer-send {
          padding: 12px 20px;
          background: linear-gradient(135deg, var(--neon-cyan), var(--neon-violet));
          color: var(--bg-deep);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.15em;
          border-radius: var(--radius-md);
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s var(--ease-out);
          box-shadow: 0 0 16px rgba(0, 240, 255, 0.3);
        }
        .drawer-send:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 24px rgba(0, 240, 255, 0.5);
        }
        .drawer-send:active { transform: translateY(0); }

        .drawer-msg {
          padding: 8px 12px;
          border-radius: var(--radius-md);
          font-size: 12px;
          font-family: var(--font-mono);
        }
        .drawer-msg.success {
          background: rgba(0, 240, 255, 0.08);
          border: 1px solid var(--border);
          color: var(--neon-cyan);
        }
        .drawer-msg.error {
          background: rgba(255, 34, 68, 0.08);
          border: 1px solid rgba(255, 34, 68, 0.4);
          color: var(--on-air-red);
        }

        @media (min-width: 768px) {
          .input-drawer {
            left: auto;
            right: 20px;
            bottom: 20px;
            max-width: 420px;
            width: 420px;
            max-height: 60vh;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-strong);
            padding-bottom: 20px;
          }
          .drawer-handle { display: none; }
        }
        /* iPhone landscape: a small floating card centered vertically
           on the right edge. Slides in from the right. Height fits
           the form (no max-height clamp). */
        @media (orientation: landscape) and (max-height: 500px) {
          .input-drawer {
            top: 50%;
            bottom: auto;
            right: 16px;
            left: auto;
            max-width: 380px;
            width: 380px;
            max-height: none;
            height: auto;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-strong);
            padding: 14px 18px 18px;
            transform: translate(120%, -50%);
          }
          .input-drawer.open { transform: translate(0, -50%); }
          .drawer-handle { display: none; }
        }
        @media (max-width: 380px) {
          .input-drawer { padding: 8px 14px calc(14px + env(safe-area-inset-bottom, 0px)); }
          .drawer-input { padding: 10px 12px; font-size: 16px; }
          .drawer-send { padding: 10px 14px; font-size: 11px; }
        }
      `}</style>
    </aside>
  );
}
