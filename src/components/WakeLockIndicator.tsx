"use client";
import { useEffect, useState } from "react";
import { parseUA, parseEnvironment } from "@/lib/ua-parser";
import type { WakeLockStatus } from "@/lib/wake-lock";

const DISMISS_KEY = "wakelock-indicator-dismissed";
const HELP_SEEN_KEY = "wakelock-help-seen";

// Small pill rendered in the bottom-right of mobile devices while
// audio is playing. Reflects the actual WakeLockStatus returned by
// `useWakeLock` so the user can tell whether the screen is being
// kept awake, the request failed (e.g. permissions), or the browser
// doesn't support the API at all (older iOS Safari).
//
// Hidden on:
//   - desktop (UA check) — Wake Lock isn't useful when the screen
//     is already a mains-powered monitor
//   - when status is `idle` (audio not playing)
//   - after the user dismisses it for the device (localStorage)
//
// Position mirrors the bottom-right reserved-area convention used by
// the on-air toast / message toast elsewhere; respects
// `env(safe-area-inset-bottom)` so it doesn't sit under the iOS home
// indicator.
interface Props {
  status: WakeLockStatus;
  isPlaying: boolean;
}

export function WakeLockIndicator({ status, isPlaying }: Props) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // helpSeen: has the user seen the OEM battery-saver help modal?
  // Independent from `dismissed`: dismissing the pill means
  // "stop showing me anything"; helpSeen means "I've been told why
  // Wake Lock might fail on this device", so a subsequent click on
  // the pill can fall back to the regular dismiss behaviour.
  const [helpSeen, setHelpSeen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // env: cached UA / WebView / iOS detection so the modal and label
  // picking don't re-parse on every render.
  const [env, setEnv] = useState<{ isWebView: boolean; isIOS: boolean }>({
    isWebView: false,
    isIOS: false,
  });

  useEffect(() => {
    // The mounted flag is the standard "render only after hydration"
    // guard — without it, SSR would emit the dismiss/mobile state
    // (which depends on `window`) and React would complain about a
    // hydration mismatch on the client. The same pattern is used in
    // IosInstallHint; the lint rule is suppressed locally because
    // there is no equivalent pre-hydration API to read these values.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (typeof window === "undefined") return;
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // Private mode / disabled storage — assume not dismissed.
    }
    try {
      setHelpSeen(window.localStorage.getItem(HELP_SEEN_KEY) === "1");
    } catch {
      /* ignore */
    }
    setIsMobile(
      parseUA(window.navigator.userAgent).deviceType === "mobile",
    );
    // Cache the platform once so the click handler and label logic
    // don't re-parse the UA on every render. parseEnvironment() reads
    // window.navigator.userAgent + matchMedia, both of which require
    // a browser context.
    const parsed = parseEnvironment();
    const isIOS = /ipad|iphone|ipod/i.test(window.navigator.userAgent);
    setEnv({ isWebView: parsed.isWebView, isIOS });
  }, []);

   
  console.log(
    "[indicator] render guards: mounted:",
    mounted,
    "isMobile:",
    isMobile,
    "dismissed:",
    dismissed,
    "isPlaying:",
    isPlaying,
    "status:",
    status,
  );
  if (!mounted) return null;
  if (!isMobile) return null;
  if (dismissed) return null;
  if (!isPlaying) return null;
  // We deliberately render in `idle` state too — it means "Wake Lock
  // request is in flight". If we hid the pill here, a stuck
  // `navigator.wakeLock.request()` would leave the user with no
  // indication that something is wrong. Showing "正在请求..." lets
  // the user distinguish "still acquiring" from "never tried".

  const palette = {
    active: "text-neon-cyan border-[rgba(140,160,255,0.5)]",
    failed: "text-on-air-red border-[rgba(255,90,120,0.5)]",
    // Wake Lock request in flight, or browser doesn't support Wake
    // Lock (e.g. iOS < 16.4). The pill still shows so the user
    // knows the screen will time out normally despite audio being
    // active.
    idle: "text-white/65 border-white/20",
    unsupported: "text-white/55 border-white/15",
  } as const;

  // Label is platform-aware. On iOS non-WebView with `unsupported`,
  // we point the user at the PWA-install path (which DOES keep audio
  // alive past lock via MediaSession, even without Wake Lock).
  // Otherwise fall back to the generic "browser doesn't support it".
  let text: string;
  if (status.state === "active") {
    text = "屏幕将保持点亮";
  } else if (status.state === "failed") {
    text = "屏幕可能自动锁定";
  } else if (status.state === "idle") {
    text = "正在请求屏幕常亮";
  } else {
    // unsupported
    text =
      env.isIOS && !env.isWebView
        ? "此 iOS 版本不支持屏幕常亮。建议将页面添加到主屏幕以获得更稳定的后台播放"
        : "此浏览器无法保持屏幕常亮";
  }

  const cls = palette[status.state];

  // Failure state on a non-WebView browser: clicking the pill opens
  // the OEM battery-saver help modal (first time) or dismisses the
  // pill (subsequent times, once help has been seen). On WebView the
  // user is already covered by WebViewAudioHint — we keep the simple
  // "tap to dismiss" behaviour here so the help modal doesn't show
  // instructions that don't apply to in-app browsers.
  const canOpenHelp = status.state === "failed" && !env.isWebView;
  const onClick = () => {
    if (canOpenHelp && !helpSeen) {
      try {
        window.localStorage.setItem(HELP_SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
      setHelpSeen(true);
      setModalOpen(true);
      return;
    }
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={text}
        title={text}
        className={`fixed right-4 bottom-[max(72px,env(safe-area-inset-bottom,72px))]
                   z-50 flex items-center gap-1.5 rounded-full border
                   bg-[rgba(13,13,24,0.92)] px-2.5 py-1 text-xs
                   backdrop-blur-[6px] pointer-events-auto
                   max-w-[calc(100vw-32px)] ${cls}`}
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <span className="whitespace-normal text-center">{text}</span>
      </button>
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="屏幕可能自动锁定的原因"
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-[4px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mx-4 w-full max-w-md rounded-2xl border border-white/15 bg-[rgba(13,13,24,0.95)] p-5 text-sm leading-[1.55] text-text-primary"
          >
            <h3 className="mb-2 text-base font-semibold tracking-wide">
              屏幕可能自动锁定的原因
            </h3>
            <p className="mb-3 text-text-secondary">
              部分 Android 设备的省电 / 后台管理策略会强制限制浏览器，导致
              Wake Lock 请求被静默拦截。可在系统设置中将浏览器加入&ldquo;自启动
              / 后台运行&rdquo;白名单。
            </p>
            <h4 className="mb-1.5 text-sm font-medium">常见机型操作路径</h4>
            <ul className="space-y-1.5 text-text-secondary">
              <li>· 小米 / MIUI / HyperOS：设置 → 应用 → 应用管理 → Chrome / Edge → 自启动 → 开启</li>
              <li>· 华为 / EMUI / HarmonyOS：手机管家 → 应用启动管理 → Chrome / Edge → 手动管理 → 全部开启</li>
              <li>· OPPO / ColorOS / Realme：设置 → 电池 → 应用耗电管理 → Chrome / Edge → 允许后台运行</li>
              <li>· vivo / OriginOS / iQOO：设置 → 电池 → 后台高耗电 → Chrome / Edge → 允许</li>
              <li>· 三星 / OneUI：设置 → 应用程序 → Chrome / Edge → 电池 → 后台使用限制 → 不优化</li>
            </ul>
            <button
              onClick={() => setModalOpen(false)}
              className="mt-4 w-full cursor-pointer rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-white/10"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
