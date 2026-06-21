// Page lifecycle event consolidation.
//
// Different browsers expose "the page is being hidden / frozen /
// resumed" through different events, and a single real-world
// backgrounding sequence can fire any combination:
//
//   iOS PWA: `visibilitychange` (sometimes), `pageshow`/`pagehide`,
//            `resume` on cold return, never `freeze`/`resume` on hot
//   Android Chrome: `visibilitychange`, `freeze` (idle tab),
//                   `resume` on return
//   Desktop Chrome (backgrounded): `visibilitychange`, `freeze`,
//                                  `resume`
//   `focus` (window focus) often fires when the user taps back to
//   the tab without a visibility transition (e.g. system hot-key
//   switcher).
//
// Rather than scatter five addEventListener calls at every call
// site, we expose a single `addLifecycleListeners` that registers
// them all and returns a cleanup. Callers pick which transitions
// they care about via the `handlers` argument; missing handlers
// are no-ops.

export interface LifecycleHandlers {
  // Page came back to the foreground / window refocused. Covers
  // visibilitychange→visible, pageshow, and focus.
  onVisible?: () => void;
  // Page-lifecycle API: the browser froze the page (idle background
  // tab, aggressive memory pressure). Chromium-only.
  onFreeze?: () => void;
  // Page-lifecycle API: the browser unfroze the page. This is the
  // event that fires WITHOUT a visibilitychange on some iOS PWA
  // background→foreground transitions, which is why the Wake Lock
  // refresh hooks into it.
  onResume?: () => void;
}

export function addLifecycleListeners(
  handlers: LifecycleHandlers,
): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => {};
  }

  const onVis = () => {
    if (document.visibilityState === "visible") {
      handlers.onVisible?.();
    }
  };
  const onPageShow = () => handlers.onVisible?.();
  const onFreeze = () => handlers.onFreeze?.();
  const onResume = () => handlers.onResume?.();
  const onFocus = () => handlers.onVisible?.();

  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("focus", onFocus);
  // Page Lifecycle API — Chrome 68+, Edge 79+, Opera 55+. Safari and
  // Firefox ignore unknown event types rather than throwing, so the
  // plain addEventListener is safe. We don't feature-detect because
  // there's no reliable signal before the first event would fire.
  document.addEventListener("freeze", onFreeze);
  document.addEventListener("resume", onResume);

  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("freeze", onFreeze);
    document.removeEventListener("resume", onResume);
  };
}