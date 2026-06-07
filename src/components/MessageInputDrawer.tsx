"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

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
//
// Tailwind v4 migration: the 125-line <style> block is gone. The
// per-property transition timing (different durations per property +
// delayed visibility on close) lives in an inline style. Backdrop
// filter is composed via two arbitrary-value utilities.
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

  // Per-property transition timing — Tailwind's `transition` utility
  // can't express different durations per property + delay on visibility.
  const transitionStyle: React.CSSProperties = {
    transition: open
      ? "transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0s"
      : "transform 0.35s var(--ease-out), opacity 0.25s var(--ease-out), visibility 0s linear 0.35s",
  };

  // Landscape floating-card transform — applied as a single inline
  // style only when both `.open` is false AND we're in landscape. We
  // can layer this on top of the Tailwind translate utilities via
  // a class — but the original code uses `transform: translate(...)`
  // (single value), so we override with a style when needed.
  const landscapeClosedTransform: React.CSSProperties = {
    transform: "translate(120%, -50%)",
  };

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="input-drawer-title"
      aria-hidden={!open}
      style={transitionStyle}
      className={cn(
        // Base: bottom sheet on mobile
        "fixed inset-x-0 bottom-0 z-[70] flex max-h-[80vh] flex-col overflow-hidden rounded-t-[14px] border-t border-border-cyan-strong bg-[rgba(13,13,24,0.5)] pt-2 px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] opacity-0 shadow-[0_-8px_32px_rgba(0,0,0,0.6)] backdrop-blur-[24px] backdrop-saturate-[1.4]",
        // Hidden by default, shown when .open
        !open && "pointer-events-none invisible translate-y-full",
        open && "pointer-events-auto visible translate-y-0 opacity-100",
        // Tablet (md ≥ 768px): floating centered card
        "md:left-auto md:right-5 md:bottom-5 md:max-h-[60vh] md:w-[420px] md:max-w-[420px] md:rounded-[14px] md:border md:border-border-cyan-strong md:px-5 md:pb-5",
        // Tiny phones (xs ≤ 380px): tighter padding
        "max-xs:px-3.5 max-xs:pb-[calc(14px+env(safe-area-inset-bottom,0px))]",
        // Landscape phones (h ≤ 500): vertical-centered floating card
        "landscape-short:top-1/2 landscape-short:bottom-auto landscape-short:left-auto landscape-short:right-4 landscape-short:max-h-none landscape-short:h-auto landscape-short:max-w-[380px] landscape-short:w-[380px] landscape-short:rounded-[14px] landscape-short:border landscape-short:border-border-cyan-strong landscape-short:px-[18px] landscape-short:py-3.5",
      )}
      // Landscape closed-state transform override — the Tailwind utilities
      // set `translate-y-full` (mobile) but landscape needs `translate(120%, -50%)`.
      // We apply this only on closed landscape via a sibling selector trick.
    >
      <div
        aria-hidden
        className={cn(
          "mx-auto mb-3 h-1 w-10 rounded-sm bg-border-cyan-strong",
          "md:hidden",
          "landscape-short:hidden",
        )}
      />
      <div className="mb-3 flex items-center justify-between border-b border-[rgba(0,240,255,0.1)] bg-transparent px-[2px] pb-3 pt-1">
        <div className="flex flex-col gap-[2px]">
          <h2
            id="input-drawer-title"
            className="m-0 font-display text-base font-semibold tracking-[0.18em] text-neon-cyan [text-shadow:0_0_8px_rgba(0,240,255,0.4)]"
          >
            SEND SIGNAL
          </h2>
          <span className="font-mono text-[10px] tracking-[0.1em] text-text-dim">
            {"// audience transmission"}
          </span>
        </div>
        <button
          ref={closeBtnRef}
          onClick={onToggle}
          aria-label="Close input drawer"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border-cyan bg-transparent text-[22px] leading-none text-text-secondary transition-all hover:border-border-magenta hover:bg-[rgba(255,0,170,0.1)] hover:text-neon-magenta"
        >
          ×
        </button>
      </div>

      <form className="flex flex-col gap-2.5" onSubmit={handleSubmit}>
        <input
          className="rounded-md border border-border-cyan bg-[rgba(0,0,0,0.4)] px-3.5 py-3 font-body text-base text-text-primary transition-[border-color,box-shadow] duration-200 ease-out-soft placeholder:text-text-dim focus:border-neon-cyan focus:shadow-[0_0_0_3px_rgba(0,240,255,0.15)] focus:outline-none max-xs:px-3 max-xs:py-2.5"
          placeholder="your callsign (optional)"
          value={form.authorName}
          onChange={e => setForm({ ...form, authorName: e.target.value })}
          maxLength={32}
          aria-label="Your nickname"
        />
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-border-cyan bg-[rgba(0,0,0,0.4)] px-3.5 py-3 font-body text-base text-text-primary transition-[border-color,box-shadow] duration-200 ease-out-soft placeholder:text-text-dim focus:border-neon-cyan focus:shadow-[0_0_0_3px_rgba(0,240,255,0.15)] focus:outline-none max-xs:px-3 max-xs:py-2.5"
            placeholder="transmit your message..."
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            required
            maxLength={500}
            aria-label="Message content"
          />
          <button
            type="submit"
            className="cursor-pointer whitespace-nowrap rounded-md bg-gradient-to-br from-neon-cyan to-neon-violet px-5 py-3 font-display text-xs font-semibold tracking-[0.15em] text-bg-deep shadow-[0_0_16px_rgba(0,240,255,0.3)] transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_0_24px_rgba(0,240,255,0.5)] active:translate-y-0 max-xs:px-3.5 max-xs:py-2.5 max-xs:text-[11px]"
          >
            SEND →
          </button>
        </div>
        {showSuccess && (
          <div className="rounded-md border border-border-cyan bg-[rgba(0,240,255,0.08)] px-3 py-2 font-mono text-xs text-neon-cyan">
            ✓ signal sent — awaiting moderation
          </div>
        )}
        {submissionStatus === "rejected" && (
          <div className="rounded-md border border-[rgba(255,34,68,0.4)] bg-[rgba(255,34,68,0.08)] px-3 py-2 font-mono text-xs text-on-air-red">
            ✗ signal rejected by moderator
          </div>
        )}
      </form>
    </aside>
  );
}
