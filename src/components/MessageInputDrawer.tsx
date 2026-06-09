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
// iOS / iPadOS compatibility:
//   1. `visualViewport` listener (Fix #1) keeps the drawer above the
//      on-screen keyboard. iOS Safari does NOT auto-shift `position: fixed`
//      elements when an <input> focuses.
//   2. `autoCapitalize` / `autoCorrect` / `spellCheck` off on both inputs
//      (Fix #2) — iOS otherwise auto-capitalizes "your callsign" and
//      auto-corrects Chinese-mixed messages, breaking the input.
//   3. `max-h-[80vh]` (Fix #4) — uses vh (not dvh) for the drawer's
//      max height. dvh is technically preferable on iOS 15.4+
//      (excludes URL bar) but parses as invalid on iPadOS 16.0-16.3,
//      which silently drops the class and collapses the drawer. vh
//      works on every Safari from 14 onward with at most a ~56px
//      over-shoot when the URL bar is showing.
//   4. Body lock via `position: fixed` + saved scrollY (Fix #5) — the
//      `body.drawer-open` rule in globals.css makes this actually
//      prevent background scroll on iOS Safari (the platform quirk
//      where `overflow: hidden` on body is ignored).
export function MessageInputDrawer({ open, onToggle, onSubmit, submissionStatus }: Props) {
  const [form, setForm] = useState<FormState>({ content: "", authorName: "" });
  const [showSuccess, setShowSuccess] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when open, and measure on-screen keyboard height.
  //
  // On iOS, simply setting `overflow: hidden` on body is NOT enough to
  // stop background scroll. The trick is to pin body with `position:
  // fixed` and remember the scroll position so we can restore it on
  // close. The CSS rule `body.drawer-open` (globals.css) owns the
  // `position: fixed` declaration; this effect just toggles the class
  // and manages the scroll offset.
  //
  // `visualViewport` is the only reliable way to detect the iOS soft
  // keyboard — it fires `resize` whenever the keyboard appears/disappears
  // (and on the new "floating keyboard" resize gestures in iPadOS).
  // On platforms without `visualViewport` (or with a non-resizing
  // viewport) the inset stays 0 and the drawer falls back to its
  // default padding.
  useEffect(() => {
    if (!open) return;

    const savedScrollY = window.scrollY;
    document.body.classList.add("drawer-open");
    // iOS quirk workaround: pin body and offset by current scrollY so
    // the visual content stays put. CSS handles `position: fixed`.
    document.body.style.top = `-${savedScrollY}px`;

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) {
      return () => {
        document.body.classList.remove("drawer-open");
        document.body.style.top = "";
        window.scrollTo(0, savedScrollY);
      };
    }

    const updateInset = () => {
      // The keyboard height = (layout viewport height) - (visual viewport height).
      // Clamp to 0 because some browsers briefly report negative deltas
      // during the keyboard slide animation.
      const inset = Math.max(0, window.innerHeight - vv.height);
      setKeyboardInset(inset);
    };
    updateInset();
    vv.addEventListener("resize", updateInset);
    vv.addEventListener("scroll", updateInset);

    return () => {
      document.body.classList.remove("drawer-open");
      document.body.style.top = "";
      window.scrollTo(0, savedScrollY);
      vv.removeEventListener("resize", updateInset);
      vv.removeEventListener("scroll", updateInset);
      setKeyboardInset(0);
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

  // Inline style that lifts the drawer above the iOS soft keyboard.
  // `20px` mirrors the Tailwind `pb-[calc(20px+env(safe-area-inset-bottom,0px))]`
  // baseline. When the keyboard is visible, add `keyboardInset` to push
  // the drawer bottom edge up by exactly the keyboard height (minus
  // the safe-area-inset-bottom that the keyboard's top edge already
  // provides on iPhone X+).
  const basePadBottom = 20;
  const paddingBottomStyle: React.CSSProperties = {
    paddingBottom: `calc(${basePadBottom}px + ${keyboardInset}px + env(safe-area-inset-bottom, 0px))`,
  };

  // Landscape closed-state transform — applied as a single inline
  // style only when both `.open` is false AND we're in landscape. We
  // can layer this on top of the Tailwind translate utilities via
  // a class — but the original code uses `transform: translate(...)`
  // (single value), so we override with a style when needed.
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="input-drawer-title"
      aria-hidden={!open}
      style={{ ...transitionStyle, ...paddingBottomStyle }}
      className={cn(
        // Base: bottom sheet on mobile. `max-h-[80vh]` reserves up to
        // 80% of the viewport height (the standard 100vh measure). We
        // deliberately use vh (not dvh) — dvh parses as invalid on
        // iPadOS 16.0-16.3, silently drops the class, and the drawer
        // collapses. vh works on every Safari from 14 onward with at
        // most a ~56px over-shoot when the URL bar is showing.
        "fixed inset-x-0 bottom-0 z-[70] flex max-h-[80vh] flex-col overflow-hidden rounded-t-[14px] border-t border-border-cyan-strong bg-[rgba(13,13,24,0.5)] pt-2 px-5 backdrop-blur-[24px] backdrop-saturate-[1.4]",
        // Hidden by default, shown when .open
        !open && "pointer-events-none invisible translate-y-full",
        open && "pointer-events-auto visible translate-y-0 opacity-100",
        // Tablet (md ≥ 768px): floating centered card
        "md:left-auto md:right-5 md:bottom-5 md:max-h-[60vh] md:w-[420px] md:max-w-[420px] md:rounded-[14px] md:border md:border-border-cyan-strong md:px-5 md:pb-5",
        // Tiny phones (xs ≤ 380px): tighter padding
        "max-xs:px-3.5",
        // Landscape phones (h ≤ 500): vertical-centered floating card
        "landscape-short:top-1/2 landscape-short:bottom-auto landscape-short:left-auto landscape-short:right-4 landscape-short:max-h-none landscape-short:h-auto landscape-short:max-w-[380px] landscape-short:w-[380px] landscape-short:rounded-[14px] landscape-short:border landscape-short:border-border-cyan-strong landscape-short:px-[18px] landscape-short:py-3.5 landscape-short:-translate-y-1/2",
        !open && "landscape-short:translate-x-[120%] landscape-short:translate-y-[-50%]",
        open && "landscape-short:translate-x-0 landscape-short:translate-y-[-50%]",
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
          // Apple HIG: ≥ 44pt touch target. The base h-9/w-9 = 36px falls
          // short on iOS — bump via touch-target utility inline.
          style={{ minHeight: 44, minWidth: 44 }}
          className="flex items-center justify-center rounded-full border border-border-cyan bg-transparent text-[22px] leading-none text-text-secondary transition-all hover:border-border-magenta hover:bg-[rgba(255,0,170,0.1)] hover:text-neon-magenta"
        >
          ×
        </button>
      </div>

      <form className="flex flex-col gap-2.5" onSubmit={handleSubmit}>
        {/*
          iOS keyboard / input behavior overrides (Fix #2):
          - autoCapitalize="off"  — stops iOS from forcing "Your Callsign"
            into "Your callsign" / "YOUR CALLSIGN"
          - autoCorrect="off"     — stops iOS from auto-correcting Chinese
            mixed with English; critical for Chinese-speaking users
          - spellCheck={false}    — hides the red squiggle underlines that
            would otherwise flash on every keystroke
          - autoComplete="off"    — prevents 1Password / iCloud Keychain
            from offering to save a 32-char "callsign" as a credential
          - inputMode="text"      — explicit text keyboard, suppresses
            Safari's email-URL-phone heuristics
          - enterKeyHint="next"   — return key shows "Next" hint on iOS 13+
        */}
        <input
          className="rounded-md border border-border-cyan bg-[rgba(0,0,0,0.4)] px-3.5 py-3 font-body text-base text-text-primary transition-[border-color,box-shadow] duration-200 ease-out-soft placeholder:text-text-dim focus:border-neon-cyan focus:shadow-[0_0_0_3px_rgba(0,240,255,0.15)] focus:outline-none max-xs:px-3 max-xs:py-2.5"
          placeholder="your callsign (optional)"
          value={form.authorName}
          onChange={e => setForm({ ...form, authorName: e.target.value })}
          maxLength={32}
          aria-label="Your nickname"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          enterKeyHint="next"
        />
        <div className="flex gap-2">
          <input
            ref={messageInputRef}
            className="min-w-0 flex-1 rounded-md border border-border-cyan bg-[rgba(0,0,0,0.4)] px-3.5 py-3 font-body text-base text-text-primary transition-[border-color,box-shadow] duration-200 ease-out-soft placeholder:text-text-dim focus:border-neon-cyan focus:shadow-[0_0_0_3px_rgba(0,240,255,0.15)] focus:outline-none max-xs:px-3 max-xs:py-2.5"
            placeholder="transmit your message..."
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            onFocus={() => {
              // iOS Safari quirk: even with the visualViewport offset
              // above, the input can land under the keyboard when the
              // drawer first opens. Scroll it into view explicitly.
              // `block: "center"` keeps the input vertically centered
              // in the visible area above the keyboard.
              requestAnimationFrame(() => {
                messageInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
              });
            }}
            required
            maxLength={500}
            aria-label="Message content"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            inputMode="text"
            enterKeyHint="send"
          />
          <button
            type="submit"
            style={{ minHeight: 44 }}
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
