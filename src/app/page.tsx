"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { RadioPlayer } from "@/components/RadioPlayer";
import { MinimalRadioPlayer } from "@/components/MinimalRadioPlayer";
import { type WallMessage } from "@/components/MessageWall";
import { MessageInputDrawer } from "@/components/MessageInputDrawer";
import { MessageWallPanel } from "@/components/MessageWallPanel";
import { EnterOverlay } from "@/components/EnterOverlay";
import { IosInstallHint } from "@/components/IosInstallHint";
import { WebViewAudioHint } from "@/components/WebViewAudioHint";
import { WakeLockIndicator } from "@/components/WakeLockIndicator";
import { wsBaseUrl } from "@/lib/ws-url";
import { useWakeLock } from "@/lib/wake-lock";
import { addLifecycleListeners } from "@/lib/page-lifecycle";
import { useRecordVisit } from "@/hooks/useRecordVisit";
import { cn } from "@/lib/cn";




interface Theme {
  id: string;
  name: string;
  description?: string;
  persona?: { name: string; prompt?: string };
  workflow?: { name: string };
}

interface AudioBufferCfg {
  prebufferSentences: number;
  prebufferSeconds: number;
  prebufferMode: "sentences" | "seconds" | "both" | "group" | "paragraph";
  prebufferGroupSize: number;
  // Mirrors the server-side AudioBufferConfig. The client doesn't act
  // on this value — it just needs the type to match the GET
  // /api/audio-buffer payload after the engine gained the
  // generation-surplus self-throttle.
  pauseThresholdMs: number;
}

type DisplayThemeId = "cyber" | "mist";

interface DisplayThemeOption {
  id: DisplayThemeId;
  name: string;
  description: string;
}

const DEFAULT_BUFFER_CFG: AudioBufferCfg = {
  prebufferSentences: 3,
  prebufferSeconds: 8,
  prebufferMode: "sentences",
  prebufferGroupSize: 3,
  pauseThresholdMs: 60_000,
};

const ENTERED_KEY = "radioai.entered";
const DISPLAY_THEME_KEY = "radioai.displayTheme";
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAAA";
const CLIENT_ID_KEY = "radioai.clientId";
// Persisted across cold starts (process killed by OEM / force-quit +
// reopen). Set "1" when startPlayback succeeds, "0" in stopPlayback.
// Read on mount to recover user intent and on `pageshow` to drive
// the cold-start recovery path.
const DESIRED_PLAYBACK_KEY = "radioai.desiredPlayback";

const DISPLAY_THEME_OPTIONS: DisplayThemeOption[] = [
  {
    id: "cyber",
    name: "Neon Broadcast",
    description: "High-contrast neon glow with the existing cyber radio mood.",
  },
  {
    id: "mist",
    name: "Mist Minimal",
    description: "A calmer layout with soft light, pale glass, and more whitespace.",
  },
];

// Each browser session has a stable clientId stored in localStorage.
// The engine uses it to distinguish "client A stopped playing" from
// "client A is gone" — without it, a single global flag would let
// one listener's STOP pause the engine for everyone (the bug fixed
// by per-client tracking in /api/live/playing). Same browser across
// tabs shares the same id so multi-tab STOP doesn't trip the engine
// for the wrong listener.
function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `c_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

// Persist user playback intent across cold starts (process killed by
// OEM aggressive battery saver, force-quit, browser crash). Read on
// mount; written by startPlayback / stopPlayback.
function readDesiredPlayback(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DESIRED_PLAYBACK_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDesiredPlayback(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DESIRED_PLAYBACK_KEY, value ? "1" : "0");
  } catch {
    // Private mode / disabled storage — ignore; the in-memory ref
    // still tracks intent for the current session.
  }
}

function detectAudioMime(bytes: Uint8Array): string {
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  ) {
    return "audio/wav";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
  ) {
    return "audio/mpeg";
  }
  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
  ) {
    return "audio/mpeg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53
  ) {
    return "audio/ogg";
  }
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  ) {
    return "audio/mp4";
  }
  return "audio/mpeg";
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if ("arrayBuffer" in blob) return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Blob did not read as ArrayBuffer"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Blob read failed"));
    reader.readAsArrayBuffer(blob);
  });
}

function decodeAudioDataCompat(ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
  const copy = buffer.slice(0);
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(copy, resolve, reject);
  });
}

export default function Home() {
  // Record this visit to the public homepage. Path is "/" (the
  // hook falls back to window.location.pathname when omitted, but
  // passing it explicitly documents intent).
  useRecordVisit("/");

  // === Theme / config ===
  const [theme, setTheme] = useState<Theme | null>(null);
  const [bufferCfg, setBufferCfg] = useState<AudioBufferCfg>(DEFAULT_BUFFER_CFG);
  const bufferCfgRef = useRef<AudioBufferCfg>(DEFAULT_BUFFER_CFG);
  useEffect(() => { bufferCfgRef.current = bufferCfg; }, [bufferCfg]);

  // Rehydrate the persisted "user wants playback" intent on mount.
  // We deliberately do NOT auto-call startPlayback() here — the
  // AudioContext needs a user gesture to resume, and a fresh page
  // load has none. The actual cold-start recovery attempt happens
  // in the `pageshow` handler below, which fires after the page
  // surface is ready and the user has interacted with the device
  // enough for AudioContext.resume() to succeed.
  useEffect(() => {
    desiredPlaybackRef.current = readDesiredPlayback();
  }, []);

  // === Enter overlay (user-gesture required) ===
  const [hasEntered, setHasEntered] = useState(false);
  const [showEnter, setShowEnter] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.requestAnimationFrame(() => {
      const entered = window.localStorage.getItem(ENTERED_KEY) === "true";
      if (entered) {
        setHasEntered(true);
        setShowEnter(false);
      } else {
        setShowEnter(true);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  // === Audio element + AudioContext + AnalyserNode ===
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Background media-session keepalive: a hidden <video> playing a
  // 1fps canvas.captureStream keeps the browser treating this tab as
  // "active media", independent of whether Wake Lock API is available.
  // Pairs with src/lib/wake-lock.ts: Wake Lock keeps the screen on
  // when supported; this video is the fallback when it's not (some
  // Android Edge / WebView builds have no navigator.wakeLock).
  const keepaliveVideoRef = useRef<HTMLVideoElement | null>(null);
  // The keepalive <video> gets a combined MediaStream with BOTH a
  // video track (canvas.captureStream) and an audio track (silent
  // OscillatorNode routed to MediaStreamDestination). A video element
  // with both tracks active is the strongest "active media" signal
  // Chromium / Edge / iOS Safari recognize — stronger than either
  // track alone, especially on Android Edge which aggressively
  // freezes tabs with single-track keepalives.
  // `videoReadyRef` is set to true once srcObject is attached in
  // ensureAudioReady. The isPlaying effect below only calls play()
  // when both `isPlaying` and `videoReadyRef.current` are true —
  // guards against the race where the effect fires before setup
  // completes (play() on a srcObject-less element throws
  // NotSupportedError). `isPlayingRef` already exists further down
  // for the same purpose in other code paths; we reuse it here.
  const videoReadyRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // === Playback state ===
  const [isPlaying, setIsPlaying] = useState(false);
  // Surfaces a one-shot "音频被其他应用暂停，点此恢复" toast when the
  // pause re-prime (audio.play() triggered by `pause` event) fails 3
  // times within 5s. Reset by the toast's onClick handler or by the
  // 8s auto-dismiss timer.
  const [reprimeToastVisible, setReprimeToastVisible] = useState(false);
  // Auto-dismiss the toast after 8s so it doesn't linger forever if
  // the user walks away. The cleanup clears the timer so a re-arm
  // (e.g. another failure burst) starts a fresh 8s window.
  useEffect(() => {
    if (!reprimeToastVisible) return;
    const id = window.setTimeout(() => setReprimeToastVisible(false), 8000);
    return () => window.clearTimeout(id);
  }, [reprimeToastVisible]);
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const [queueLength, setQueueLength] = useState(0);
  const [bufferStatus, setBufferStatus] = useState<{ ready: boolean; sentences: number; seconds: number; needed: number }>({ ready: false, sentences: 0, seconds: 0, needed: 0 });
  const audioQueueRef = useRef<string[]>([]);
  const decodedQueueRef = useRef<AudioBuffer[]>([]);
  const durationQueueRef = useRef<number[]>([]);
  const isPlayingRef = useRef(false);
  const webAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  // startPlayback is declared further down (line ~1300) but referenced
  // earlier in the `pageshow` handler for cold-start recovery. Mirrors
  // the playNextRef pattern: a stable handle the early effects can
  // capture without taking a forward reference to `startPlayback`
  // itself (TypeScript would flag the temporal dead zone).
  const startPlaybackRef = useRef<(() => Promise<void>) | null>(null);
  const desiredPlaybackRef = useRef(false);
  const hasStartedRef = useRef(false);
  const currentUrlRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioPrimedRef = useRef(false);
  // Last MediaMetadata we assigned to navigator.mediaSession.metadata.
  // The MediaSession effect re-runs on `[theme, hasEntered]`, and
  // Chromium-class browsers re-fetch the artwork URLs on every
  // assignment — even when the underlying values are identical. We
  // compare against this ref and skip the assignment when nothing
  // has changed, which stops the /icons/icon-{192,512}.png
  // request storm in DevTools Network. Content equality is
  // sufficient because the artwork URLs are static in this app.
  const lastMediaMetaRef = useRef<{ title: string; artist: string; album: string } | null>(null);
  // Dedup window for WS-reconnect replays. ws-server's new-connection
  // handler drains the last N=audioBufferMaxSize chunks to every
  // reconnecting client (ws-server/index.ts:266-281). When the audio
  // WS drops (Doze, lock screen, network blip) and reconnects, the
  // client gets a fresh copy of chunks it just played. The Set here
  // catches those exact-byte duplicates; the dedup guard at the top
  // of enqueueAudioBuffer rejects them before any decode/push work.
  // Capped at 16 entries — covers a generous prebuffer + a couple
  // of segments of headroom. Cleared on stopPlayback() and on the
  // flush JSON message (engine STOP or theme change), so legitimate
  // replays after a manual reset still queue.
  const recentChunkHashesRef = useRef<Set<string>>(new Set());
  const RECENT_HASH_CAP = 16;
  // P0-2: persist the dedup window to sessionStorage so it survives
  // a page refresh / tab reload / OS-process-kill-recover cycle. In
  // those scenarios the in-memory Set is empty (it's a useRef, lives
  // only as long as the React component does), so before this change
  // every reconnect had an empty dedup set and the server's replay
  // buffer drained straight into the playback queue — the
  // "just-heard-sentences-played-again" symptom.
  //
  // We persist:
  //   - On every `add` (debounced 500ms via persistDedup below)
  //   - On clear (stopPlayback, flush message) via clearPersistedDedup
  //
  // We do NOT persist across an explicit user STOP+PLAY cycle unless
  // `clearPersistedDedup` is called by stopPlayback — that preserves
  // the "fresh playback, no pre-suppression" semantics the existing
  // in-memory clear provides. Private-mode browsers may not have
  // sessionStorage; all writes/reads are wrapped in try/catch and
  // silently fall back to the in-memory-only behavior.
  //
  // Storage key is namespaced ("radioai-audio-dedup-v1") and versioned
  // — bump v1 → v2 if the hash format changes (e.g., switching off
  // djb2-4KB to a stronger hash) to invalidate stale entries.
  const DEDUP_STORAGE_KEY = "radioai-audio-dedup-v1";
  const dedupPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDedup = useCallback(() => {
    if (typeof window === "undefined") return;
    if (dedupPersistTimerRef.current) return; // already pending
    dedupPersistTimerRef.current = setTimeout(() => {
      dedupPersistTimerRef.current = null;
      try {
        const arr = Array.from(recentChunkHashesRef.current);
        sessionStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify(arr));
      } catch {
        /* sessionStorage may be unavailable (private mode, quota) */
      }
    }, 500);
  }, []);
  const clearPersistedDedup = useCallback(() => {
    if (typeof window === "undefined") return;
    if (dedupPersistTimerRef.current) {
      clearTimeout(dedupPersistTimerRef.current);
      dedupPersistTimerRef.current = null;
    }
    try {
      sessionStorage.removeItem(DEDUP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  // Load persisted dedup state once on mount. Runs before any
  // enqueueAudioBuffer call (enqueueAudioBuffer is invoked from
  // socket.onmessage, which can't fire until connectAudioSocket has
  // been called, which only happens after the autostart effect —
  // all well after this mount effect).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(DEDUP_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      const set = recentChunkHashesRef.current;
      let added = 0;
      for (const h of arr) {
        if (typeof h === "string" && !set.has(h) && added < RECENT_HASH_CAP) {
          set.add(h);
          added++;
        }
      }
    } catch {
      /* corrupted / unavailable storage — ignore */
    }
  }, []);
  // P0-3: re-prime cooldown lock. Several handlers
  // (visibilitychange, pageshow, audio.onpause) all call
  // audio.play() to recover from transient OS-induced pauses.
  // iOS Safari / Android Chrome often fire these back-to-back in the
  // same visibility / focus event — without a cooldown, the same
  // intent produces multiple audio.play() calls racing against each
  // other (and against an in-flight playNext()). The first call
  // usually wins; the rest are wasted work at best and can re-enter
  // the playNext → enqueueAudioBuffer chain at worst.
  //
  // 500ms is short enough that real inter-app transitions (phone
  // call ends → audio resumes) feel instant, and long enough to
  // swallow same-tick bursts. NOT used by the cold-start recovery
  // path in onPageShow — that path calls startPlayback() (a fresh
  // initialization), not a re-prime.
  const lastReprimeAtRef = useRef(0);
  const REPRIME_COOLDOWN_MS = 500;
  const tryReprime = () => {
    const now = Date.now();
    if (now - lastReprimeAtRef.current < REPRIME_COOLDOWN_MS) return false;
    lastReprimeAtRef.current = now;
    return true;
  };
  // Audio WebSocket reconnect (Fix #6) — iOS Safari suspends WS in the
  // background and may not surface the close. We mirror the message-WS
  // retry loop (see below) so a transient drop (ws-server restart, idle
  // proxy timeout, iOS background→foreground) heals on its own.
  const audioSocketRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioSocketBackoffRef = useRef(1000);
  // Refs to the latest connectAudioSocket callback and the most
  // recent themeId used to open the audio WS. The visibilitychange
  // force-reconnect effect (added below) reads these instead of
  // taking a forward reference to connectAudioSocket (declared ~900
  // lines further down — same pattern as playNextRef /
  // startPlaybackRef).
  const connectAudioSocketRef = useRef<((themeId: string) => void) | null>(null);
  const currentThemeIdRef = useRef<string | null>(null);
  // Audio WS heartbeat / watchdog — see connectAudioSocket. The
  // watchdog is what actually catches silent drops today (no
  // message of any kind for 60s → force-close → existing onclose
  // retry loop). The heartbeat ping is forward-looking for a
  // server that echoes it; the current server ignores it, but
  // sending it costs nothing. Both refs are torn down in onclose
  // AND in stopPlayback so a PLAY→STOP→PLAY cycle can't leak a
  // timer that fires against the wrong socket.
  const audioSocketHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioSocketWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldAutoStartRef = useRef(false); // try to autostart once entered

  // === Messages ===
  const [wallMessages, setWallMessages] = useState<WallMessage[]>([]);
  const [submissionStatus, setSubmissionStatus] = useState<"idle" | "pending" | "rejected">("idle");
  const submittedIdRef = useRef<string | null>(null);
  const msgSocketRef = useRef<WebSocket | null>(null);
  // Defaults to true so first paint still shows the message UI if the
  // /api/messages/config fetch hasn't returned yet.
  const [messageFrontendVisible, setMessageFrontendVisible] = useState<boolean>(true);
  // Soft default of 50 matches DEFAULT_MESSAGE_CONFIG in src/config. The
  // /api/messages/config fetch below overwrites it; the WebSocket
  // new_message handler also re-reads via this ref so admin changes
  // take effect for new WS messages without a full reload.
  const [maxVisibleMessages, setMaxVisibleMessages] = useState<number>(50);
  const maxVisibleMessagesRef = useRef<number>(50);
  // Wall scroll speed (seconds per screen). Default 80 matches
  // DEFAULT_MESSAGE_CONFIG. The admin page can change this at runtime;
  // we re-fetch on visibility/focus + a slow poll so the change
  // propagates to listeners without a manual reload.
  const [scrollSpeedSeconds, setScrollSpeedSeconds] = useState<number>(80);

  // === Panel / drawer toggles (mutually exclusive: opening one
  //     auto-closes the other so they never appear simultaneously) ===
  const [wallOpen, setWallOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Theme state must initialize to a value that's identical on the server
  // and the client, otherwise the SSR HTML and the first client render
  // disagree about which <RadioPlayer> tree to mount (cyber vs mist) and
  // React throws hydration error #418. We pick "mist" as the universal
  // default and rehydrate the user's choice from localStorage in a
  // post-mount effect below; this effect also no-ops on the server.
  const [displayTheme, setDisplayTheme] = useState<DisplayThemeId>("mist");
  const toggleWall = useCallback(() => {
    setWallOpen(v => !v);
    setInputOpen(false);
    setSettingsOpen(false);
  }, []);
  const toggleInput = useCallback(() => {
    setInputOpen(v => !v);
    setWallOpen(false);
    setSettingsOpen(false);
  }, []);
  const toggleSettings = useCallback(() => {
    setSettingsOpen(v => !v);
    setWallOpen(false);
    setInputOpen(false);
  }, []);

  // Rehydrate the saved theme once the client has mounted. Runs before
  // any user interaction can read displayTheme, so a returning user
  // still sees their last choice after the brief "mist" flash on first
  // paint. We also split the "read on mount" effect from the
  // "write on change" effect below so the localStorage write is
  // guaranteed to skip the initial rehydration.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = window.localStorage.getItem(DISPLAY_THEME_KEY);
    if (savedTheme === "cyber" || savedTheme === "mist") {
      setDisplayTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.displayTheme = displayTheme;
    window.localStorage.setItem(DISPLAY_THEME_KEY, displayTheme);
  }, [displayTheme]);

  const ensureAudioReady = useCallback(async () => {
    if (typeof window === "undefined" || !audioRef.current) return false;

    if (audioCtxRef.current) {
      try {
        if (audioCtxRef.current.state === "suspended") {
          await audioCtxRef.current.resume();
        }
        if (audioGainRef.current) audioGainRef.current.gain.value = volumeRef.current;
        if (analyserRef.current) setAnalyser(analyserRef.current);
        setHasEntered(true);
        setShowEnter(false);
        return true;
      } catch (err) {
        console.error("[audio] resume failed:", err);
        return false;
      }
    }

    try {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (!Ctx) throw new Error("Web Audio API not supported");
      const ctx = new Ctx();
      await ctx.resume();
      audioCtxRef.current = ctx;
      // Web Audio API quirk: the context can drift to `suspended`
      // mid-playback (iOS background restore, aggressive Android
      // WebView battery savers, audio-focus loss on another tab).
      // Without a listener, audio goes silent until the next user
      // gesture. We arm a statechange watcher that calls resume()
      // whenever we drift away from `running`. The listener is
      // attached exactly once because the surrounding
      // `if (audioCtxRef.current)` early-return above short-
      // circuits any second call to ensureAudioReady.
      ctx.addEventListener("statechange", () => {
        if (ctx.state === "suspended") {
          console.warn("[audio-ctx] suspended, attempting resume");
          ctx.resume().catch((err: unknown) => {
            console.warn("[audio-ctx] resume failed:", err);
          });
        }
      });

      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.7;
      analyserNode.connect(ctx.destination);
      analyserRef.current = analyserNode;
      setAnalyser(analyserNode);

      const gainNode = ctx.createGain();
      gainNode.gain.value = volumeRef.current;
      gainNode.connect(analyserNode);
      audioGainRef.current = gainNode;

      try {
        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(gainNode);
      } catch (err) {
        console.error("[audio] analyser init failed:", err);
      }
      window.localStorage.setItem(ENTERED_KEY, "true");
      setHasEntered(true);
      setShowEnter(false);
      if (!audioPrimedRef.current) {
        const prevSrc = audioRef.current.currentSrc || audioRef.current.src;
        const prevMuted = audioRef.current.muted;
        audioRef.current.muted = true;
        audioRef.current.src = SILENT_WAV_DATA_URI;
        try {
          await audioRef.current.play();
          audioRef.current.pause();
        } catch (err) {
          console.error("[audio] prime failed:", err);
        } finally {
          audioRef.current.removeAttribute("src");
          audioRef.current.load();
          audioRef.current.muted = prevMuted;
          if (prevSrc) audioRef.current.src = prevSrc;
        }
        audioPrimedRef.current = true;
      }
      // Background media-session keepalive: silently play a
      // stream-backed <video> so the browser keeps this tab marked
      // "active media" even when Wake Lock API is unavailable.
      //
      // The stream carries BOTH a video track (2x2 canvas) and an
      // audio track (silent OscillatorNode via MediaStreamDestination).
      // A <video> element with both tracks active is the strongest
      // active-media signal Chromium recognizes — single-track
      // keepalives (audio-only OR video-only) were insufficient on
      // the user's Edge Android 16 (see plan-history). Muted +
      // autoplay is allowed without gesture.
      //
      // NOTE: do NOT await play() here. The earlier design called
      // `await video.play()` after attaching srcObject, but the
      // isPlaying effect below fires v.pause() during setup (because
      // isPlaying is still false at this point — user hasn't clicked
      // PLAY yet), which aborts the in-flight play promise with
      // AbortError. Now setup only attaches the stream; the isPlaying
      // effect is the canonical play/pause trigger. videoReadyRef
      // gates the effect so play() never runs before srcObject exists.
      console.log(
        "[keepalive-video] ref:",
        keepaliveVideoRef.current ? "mounted" : "null",
      );
      if (
        keepaliveVideoRef.current &&
        audioCtxRef.current
      ) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 2;
          canvas.height = 2;
          console.log("[keepalive-video] canvas created");
          const videoStream = canvas.captureStream(1);
          console.log(
            "[keepalive-video] video stream captured:",
            videoStream ? "ok" : "null",
          );

          // Audio track: silent oscillator wired to MediaStreamDestination.
          // frequency=0 + gain=0 → real PCM zero samples, not empty
          // buffer (browsers won't optimize an empty buffer away, but
          // will play actual zero samples through the audio pipeline).
          const audioDest =
            audioCtxRef.current.createMediaStreamDestination();
          const osc = audioCtxRef.current.createOscillator();
          const gain = audioCtxRef.current.createGain();
          gain.gain.value = 0;
          osc.frequency.value = 0;
          osc.connect(gain).connect(audioDest);
          osc.start();
          console.log(
            "[keepalive-video] audio track created:",
            audioDest.stream.getAudioTracks().length,
            "track(s)",
          );

          const combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...audioDest.stream.getAudioTracks(),
          ]);
          console.log(
            "[keepalive-video] combined stream:",
            combinedStream.getVideoTracks().length,
            "video +",
            combinedStream.getAudioTracks().length,
            "audio",
          );

          keepaliveVideoRef.current.srcObject = combinedStream;
          keepaliveVideoRef.current.muted = true;
          videoReadyRef.current = true;
          console.log("[keepalive-video] srcObject attached, ready");
          // If audio is already playing (race: user clicked PLAY
          // before setup completed), start the video immediately so
          // we don't wait for the next isPlaying effect run.
          if (isPlayingRef.current) {
            keepaliveVideoRef.current.play().catch(() => {});
            console.log("[keepalive-video] catch-up play()");
          }
        } catch (err) {
          console.warn("[keepalive-video] failed:", err);
        }
      }
      return true;
    } catch (err) {
      console.error("[audio] init failed:", err);
      return false;
    }
  }, []);

  // === Init: fetch config + initial messages ===
  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(t => {
      if (t) setTheme(t);
    });
    fetch("/api/audio-buffer").then(r => r.json()).then(c => {
      if (c) {
        setBufferCfg(prev => ({ ...prev, ...c }));
        bufferCfgRef.current = { ...DEFAULT_BUFFER_CFG, ...c };
      }
    }).catch(() => {});
    // Public read endpoint — see src/app/api/messages/config/route.ts.
    // The admin-scoped URL was a pre-existing leak that only worked
    // because the proxy used to accept any non-empty cookie; it now
    // requires a real session and rejects public listeners.
    fetch("/api/messages/config").then(r => r.json()).then(cfg => {
      if (cfg && typeof cfg.frontendVisible === "boolean") {
        setMessageFrontendVisible(cfg.frontendVisible);
      }
      if (cfg && typeof cfg.maxVisibleMessages === "number" && cfg.maxVisibleMessages > 0) {
        setMaxVisibleMessages(cfg.maxVisibleMessages);
        maxVisibleMessagesRef.current = cfg.maxVisibleMessages;
      }
      if (cfg && typeof cfg.scrollSpeedSeconds === "number" && cfg.scrollSpeedSeconds >= 5) {
        setScrollSpeedSeconds(cfg.scrollSpeedSeconds);
      }
    }).catch(() => {});
    fetch("/api/messages")
      .then(r => r.json())
      .then((list: WallMessage[]) => setWallMessages(list))
      .catch(() => {});
  }, []);

  // === Message WebSocket ===
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!messageFrontendVisible) return;
    // WS base URL — set NEXT_PUBLIC_WS_URL in .env (or your deploy
    // config) when the production WSS endpoint is on a different
    // host/port than the ws-server's default :8080 (e.g. a
    // Cloudflare origin rule, Tunnel, or nginx/caddy in front). If
    // unset, the browser connects to ws/wss on the page's hostname
    // at :8080, which matches the ws-server default for dev.
    //
    // The socket auto-reconnects with exponential backoff on close.
    // Without this, a transient drop (ws-server restart, network blip,
    // reverse-proxy idle timeout) leaves the page permanently blind to
    // new messages until the user manually reloads.
    const base = wsBaseUrl();
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 1000;
    const MAX_BACKOFF_MS = 15_000;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(`${base}/messages`);
      msgSocketRef.current = ws;
      ws.onopen = () => { backoffMs = 1000; };
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        try {
          const evt = JSON.parse(e.data);
          if (evt.type === "new_message" && evt.message) {
            const m = evt.message as WallMessage;
            setWallMessages(prev => {
              if (prev.some(x => x.id === m.id)) return prev;
              // Respect the admin "前台显示的最多留言数" cap. The list is
              // chronological (oldest → newest), so on overflow we drop
              // the oldest entries from the front. The ref is read here
              // (not state) so the value used is the latest one captured
              // at handler-attach time when state changes.
              const limit = maxVisibleMessagesRef.current;
              const next = [...prev, { id: m.id, content: m.content, authorName: m.authorName, createdAt: m.createdAt }];
              return next.length > limit ? next.slice(next.length - limit) : next;
            });
            if (m.id === submittedIdRef.current) {
              setSubmissionStatus("idle");
              submittedIdRef.current = null;
            }
          } else if (evt.type === "message_hidden" && typeof evt.id === "string") {
            setWallMessages(prev => prev.filter(x => x.id !== evt.id));
          } else if (evt.type === "message_rejected" && typeof evt.id === "string") {
            setWallMessages(prev => prev.filter(x => x.id !== evt.id));
            if (evt.id === submittedIdRef.current) {
              setSubmissionStatus("rejected");
            }
          }
        } catch {
          // ignore malformed
        }
      };
      // onerror always precedes onclose in the spec, so we let onclose
      // own the reconnect logic and leave onerror as a no-op. Adding a
      // scheduleRetry here would double-fire.
      ws.onerror = () => {};
      ws.onclose = () => {
        msgSocketRef.current = null;
        if (cancelled) return;
        retryTimer = setTimeout(() => {
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
          connect();
        }, backoffMs);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    };
  }, [messageFrontendVisible]);

  // Poll the visible message list so the wall still updates even when
  // the message WebSocket is idle, blocked by a proxy, or temporarily down.
  useEffect(() => {
    if (typeof window === "undefined" || !messageFrontendVisible) return;

    let cancelled = false;
    const syncMessages = () => {
      fetch("/api/messages")
        .then(r => r.json())
        .then((list: WallMessage[]) => {
          if (!cancelled) setWallMessages(list);
        })
        .catch(() => {});
    };

    syncMessages();
    const id = window.setInterval(syncMessages, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [messageFrontendVisible]);

  // When the admin changes the cap at runtime, reconcile the in-memory
  // list with the new limit:
  //   - shrink path (cap lowered): trim the oldest entries locally
  //   - grow path (cap raised): the local list is shorter than the new
  //     cap, so refetch from the server to fill it. /api/messages reads
  //     the current cap on every request, so a single GET returns up to
  //     the new limit and the wall re-renders at the new size.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.requestAnimationFrame(() => {
      setWallMessages(prev => (
        prev.length > maxVisibleMessages
          ? prev.slice(prev.length - maxVisibleMessages)
          : prev
      ));
      if (messageFrontendVisible) {
        fetch("/api/messages")
          .then(r => r.json())
          .then((list: WallMessage[]) => setWallMessages(list))
          .catch(() => {});
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [maxVisibleMessages, messageFrontendVisible]);

  // Re-fetch admin message config on visibility/focus + a slow poll so
  // runtime changes (max visible, scroll speed, frontend visibility
  // toggle) propagate to listeners without a manual reload. Server is
  // local + cheap, so polling is fine; visibility/focus closes the
  // gap to "near-instant" when the user is already on the page.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;
    const apply = (cfg: { frontendVisible?: boolean; maxVisibleMessages?: number; scrollSpeedSeconds?: number }) => {
      if (cancelled) return;
      if (typeof cfg.frontendVisible === "boolean") {
        setMessageFrontendVisible(cfg.frontendVisible);
      }
      if (typeof cfg.maxVisibleMessages === "number" && cfg.maxVisibleMessages > 0) {
        setMaxVisibleMessages(cfg.maxVisibleMessages);
        maxVisibleMessagesRef.current = cfg.maxVisibleMessages;
      }
      if (typeof cfg.scrollSpeedSeconds === "number" && cfg.scrollSpeedSeconds >= 5) {
        setScrollSpeedSeconds(cfg.scrollSpeedSeconds);
      }
    };
    const refetch = () => {
      fetch("/api/messages/config")
        .then(r => r.json())
        .then(apply)
        .catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const onFocus = () => refetch();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(refetch, 15_000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, []);

  // === Media Session API: tell the OS this is a media app so it
  //     (a) keeps audio alive when the page is hidden (iOS PWA, Android
  //         background), and
  //     (b) shows playback controls in the lock screen / notification
  //         shade. Without this, iOS Safari pauses audio the moment the
  //         screen locks. ===
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const updateMetadata = () => {
      const hostName = theme?.persona?.name ?? "AI";
      const title = theme?.name ? `RADIO AI · ${theme.name}` : "RADIO AI";
      const artist = `Host: ${hostName}`;
      const album = "Live Broadcast";
      // Skip the assignment when nothing has changed. Chromium-class
      // browsers re-fetch every artwork URL on each
      // `navigator.mediaSession.metadata = ...` call, even when the
      // new MediaMetadata is content-equal to the existing one.
      // Comparing text fields is enough because the artwork URLs
      // are static in this app.
      const last = lastMediaMetaRef.current;
      if (last && last.title === title && last.artist === artist && last.album === album) {
        return;
      }
      lastMediaMetaRef.current = { title, artist, album };
      navigator.mediaSession!.metadata = new MediaMetadata({
        title,
        artist,
        album,
        // Lock-screen / control-center artwork. Reuses the PWA icons;
        // browsers ignore missing images and the audio still plays.
        artwork: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      });
    };
    updateMetadata();

    const audio = audioRef.current;
    if (!audio) return;

    const updateState = () => {
      if (!("mediaSession" in navigator) || !navigator.mediaSession) return;
      navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
    };
    audio.addEventListener("play", updateState);
    audio.addEventListener("pause", updateState);
    audio.addEventListener("ended", updateState);
    updateState();

    return () => {
      audio.removeEventListener("play", updateState);
      audio.removeEventListener("pause", updateState);
      audio.removeEventListener("ended", updateState);
    };
  }, [theme, hasEntered]);

  // === Lock-screen / notification action handlers. ===
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const tryPlay = () => {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
    };
    const tryPause = () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    };
    navigator.mediaSession.setActionHandler("play", tryPlay);
    navigator.mediaSession.setActionHandler("pause", tryPause);
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
    };
  }, [hasEntered]);

  // === Screen wake lock: keep the device awake while audio is playing
  //     OR the buffer/WS is alive (covers the brief gap between PLAY
  //     click and first segment, plus inter-segment pauses). All three
  //     signals go false on explicit stopPlayback, so the screen still
  //     dims once the user stops. See src/lib/wake-lock.ts for the
  //     platform support matrix. ===
  const { status: wakeLockStatus, refresh: refreshWakeLock } = useWakeLock(
    isPlaying || connected || bufferStatus.ready,
  );

  // === Layer 5: page-lifecycle freeze/resume re-arm ===
  //
  // The Wake Lock API spec requires the browser to release the
  // sentinel when the page is hidden. Our `useWakeLock` hook
  // re-acquires on `visibilitychange` → visible, which covers the
  // common case. But on iOS PWA, background→foreground transitions
  // sometimes fire the Page-Lifecycle API `resume` event WITHOUT a
  // corresponding `visibilitychange`, leaving the sentinel in a
  // stale-released state until the user backgrounds and re-foregrounds
  // the tab a second time. `refreshWakeLock` calls the LATEST
  // `acquire` closure from `useWakeLock` to force a re-acquire
  // attempt on every `resume`, regardless of whether visibility also
  // flipped.
  //
  // The `freeze` event is intentionally not handled: the browser
  // releases the sentinel on its own when the page freezes, so the
  // only thing we need on `freeze` is to do nothing.
  useEffect(() => {
    const remove = addLifecycleListeners({
      onResume: () => {
        console.log(
          "[page-lifecycle] resume, refreshing wake lock sentinel",
        );
        refreshWakeLock();
      },
    });
    return remove;
  }, [refreshWakeLock]);

  // === WS force-reconnect on visibility return ===
  //
  // When Android locks the screen (or any other foreground→background
  // transition), the JS context may be suspended and the audio WS
  // connection torn down by the OS / NAT. When the user unlocks,
  // JS resumes but the pending reconnect timer might still be in
  // its exponential-backoff window (up to 15s). For an audio stream
  // that's a noticeable dead-air gap, so we force-reconnect
  // immediately when:
  //   - visibility flips back to "visible"
  //   - the user still wants playback (desiredPlaybackRef)
  //   - the WS is actually down (CLOSED / CLOSING / null —
  //     CONNECTING is left alone since the existing retry will
  //     resolve it)
  // and reset the backoff schedule so the next drop starts fresh.
  useEffect(() => {
    const remove = addLifecycleListeners({
      onVisible: () => {
        if (!desiredPlaybackRef.current) return;
        const ws = socketRef.current;
        const isDown =
          !ws ||
          ws.readyState === WebSocket.CLOSED ||
          ws.readyState === WebSocket.CLOSING;
        if (!isDown) return;
        console.log(
          "[page-lifecycle] visible + playing + WS down, force-reconnecting",
        );
        // Cancel any pending backoff retry so we don't double-reconnect.
        if (audioSocketRetryRef.current) {
          clearTimeout(audioSocketRetryRef.current);
          audioSocketRetryRef.current = null;
        }
        // Reset backoff so the next close cycle starts fresh.
        audioSocketBackoffRef.current = 500;
        const themeId = currentThemeIdRef.current;
        if (themeId) {
          connectAudioSocketRef.current?.(themeId);
        }
      },
    });
    return remove;
  }, []);

  // Background media-session keepalive sync: when audio is playing
  // we keep the <video> keepalive playing so the browser / OS keeps
  // treating this tab as "active media" and the WebSocket stays open.
  // On STOP we pause (saves CPU/battery).
  //
  // The `videoReadyRef` gate prevents video.play() from running before
  // ensureAudioReady has finished attaching srcObject — which would
  // throw a NotSupportedError on a srcObject-less element.
  useEffect(() => {
    const v = keepaliveVideoRef.current;
    if (!v) return;
    if (isPlaying && videoReadyRef.current) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying]);

  // === Visibility / page-lifecycle guard: when the screen turns off or
  //     the OS suspends the page, some browsers pause the <audio>.
  //     Re-prime play() so playback resumes automatically when the
  //     page becomes visible again. The Media Session API handles the
  //     "stay alive while hidden" half; this handles the "recover" half. ===
  useEffect(() => {
    const onVisibilityChange = () => {
      const a = audioRef.current;
      if (!a) return;
      // If we believe we should be playing but the audio got paused
      // (e.g. by the OS while the page was hidden), kick it back on.
      // P0-3: gated by tryReprime cooldown so a same-tick
      // visibility+pageshow double-fire only triggers one play().
      if (isPlaying && a.paused && tryReprime()) {
        a.play().catch(() => {});
      }
    };
    const onPageShow = () => {
      // Cold-start recovery: if the user wanted playback (persisted
      // from before the page was killed) but `isPlaying` is false
      // (state lost with the process), run full startPlayback() to
      // re-open the WS + set up the audio pipeline. If we are
      // already playing (hot foreground), fall through to the
      // existing audio.play() re-prime below.
      if (desiredPlaybackRef.current && !isPlaying) {
        console.log("[page-lifecycle] cold-start recovery from pageshow");
        // Call through the ref so this handler doesn't take a
        // forward reference to `startPlayback` (declared ~400 lines
        // further down). startPlaybackRef is populated by a
        // useEffect that runs on mount, before any pageshow can fire.
        void startPlaybackRef.current?.();
        return;
      }
      const a = audioRef.current;
      if (!a) return;
      // P0-3: gated by tryReprime cooldown (shared with
      // visibilitychange above — see plan).
      if (isPlaying && a.paused && tryReprime()) {
        a.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [isPlaying]);

  // Audio pause re-prime: any pause event while the user still
  // wants playback is treated as "the OS stole audio focus",
  // not "the user stopped". Covers the cases the visibilitychange
  // handler above misses:
  //   - Android MediaSession / AudioFocus loss (call, navigation,
  //     another music app starting) — Chromium auto-pauses
  //     <audio> but does NOT raise visibilitychange
  //   - iOS PWA MediaSession context being revoked
  // The `desiredPlaybackRef.current && isPlayingRef.current`
  // guard means explicit stopPlayback() (which sets both to false
  // BEFORE calling audio.pause()) is correctly NOT re-primed.
  useEffect(() => {
    if (!hasEntered) return;
    const audio = audioRef.current;
    if (!audio) return;
    // Track consecutive failed re-prime attempts within a 5s window.
    // After 3 failures, surface a "tap to resume" toast — a real user
    // tap counts as a user gesture, which iOS requires for audio
    // resume after Siri/FaceTime audio-session interruption, and
    // Android benefits from the same gesture context for AudioFocus
    // reacquisition. The timestamps array lives in the effect closure
    // so it resets naturally across effect runs.
    let failureTimestamps: number[] = [];
    const onPause = () => {
      if (
        !desiredPlaybackRef.current ||
        !isPlayingRef.current ||
        !audio.paused
      ) {
        return;
      }
      // P0-3: gated by tryReprime cooldown (shared with
      // visibilitychange/pageshow handlers above). Without this,
      // a flaky network can produce a burst of pause events each
      // of which would trigger its own audio.play() — wasted work
      // and possibly visible as audio stutter.
      if (!tryReprime()) return;
      audio.play().catch(() => {
        const now = Date.now();
        failureTimestamps = failureTimestamps.filter((t) => now - t < 5000);
        failureTimestamps.push(now);
        if (failureTimestamps.length >= 3) {
          console.warn(
            "[audio] pause re-prime failed 3x in 5s, surfacing toast",
          );
          setReprimeToastVisible(true);
        }
      });
    };
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("pause", onPause);
    };
  }, [hasEntered]);

  const checkBufferReady = useCallback((): { ready: boolean; sentences: number; seconds: number; needed: number } => {
    const cfg = bufferCfgRef.current;
    const sentences = audioQueueRef.current.length + decodedQueueRef.current.length;
    const seconds = durationQueueRef.current.reduce((a, b) => a + b, 0);
    let ready = false;
    let needed = 0;
    if (cfg.prebufferMode === "sentences") {
      ready = sentences >= cfg.prebufferSentences;
      needed = Math.max(0, cfg.prebufferSentences - sentences);
    } else if (cfg.prebufferMode === "seconds") {
      ready = seconds >= cfg.prebufferSeconds;
      needed = Math.max(0, cfg.prebufferSeconds - seconds);
    } else if (cfg.prebufferMode === "both") {
      ready = sentences >= cfg.prebufferSentences && seconds >= cfg.prebufferSeconds;
      needed = Math.max(cfg.prebufferSentences - sentences, cfg.prebufferSeconds - seconds);
    } else if (cfg.prebufferMode === "group" || cfg.prebufferMode === "paragraph") {
      ready = sentences >= cfg.prebufferSentences;
      needed = Math.max(0, cfg.prebufferSentences - sentences);
    } else {
      ready = sentences >= cfg.prebufferSentences;
      needed = Math.max(0, cfg.prebufferSentences - sentences);
    }
    return { ready, sentences, seconds, needed };
  }, []);

  const updateBufferStatus = useCallback(() => {
    const status = checkBufferReady();
    setBufferStatus(status);
    return status.ready;
  }, [checkBufferReady]);

  // === Playback logic ===
  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    if (decodedQueueRef.current.length > 0) {
      const ctx = audioCtxRef.current;
      const gainNode = audioGainRef.current;
      const nextBuffer = decodedQueueRef.current.shift();
      if (!ctx || !gainNode || !nextBuffer) return;
      const source = ctx.createBufferSource();
      source.buffer = nextBuffer;
      source.connect(gainNode);
      webAudioSourceRef.current = source;
      isPlayingRef.current = true;
      source.onended = () => {
        if (webAudioSourceRef.current !== source) return;
        webAudioSourceRef.current = null;
        try { source.disconnect(); } catch {}
        isPlayingRef.current = false;
        if (durationQueueRef.current.length > 0) durationQueueRef.current.shift();
        updateBufferStatus();
        playNextRef.current();
        fetch("/api/live/playback-complete", { method: "POST" }).catch(() => {});
      };
      source.start(0);
      setQueueLength(audioQueueRef.current.length + decodedQueueRef.current.length);
      return;
    }

    if (audioQueueRef.current.length === 0) {
      hasStartedRef.current = false;
      return;
    }
    const nextUrl = audioQueueRef.current.shift();
    if (!nextUrl) return;
    if (!audioRef.current) return;
    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    currentUrlRef.current = nextUrl;
    const audio = audioRef.current;
    audio.src = nextUrl;
    audio.volume = volumeRef.current;
    audio.load();
    isPlayingRef.current = true;
    const retryPlayOnce = () => {
      const a = audioRef.current;
      if (!a || currentUrlRef.current !== nextUrl) return;
      a.play().catch(() => {
        isPlayingRef.current = false;
      });
    };
    const p = audio.play();
    if (p) {
      p.catch(() => {
        const a = audioRef.current;
        if (!a || currentUrlRef.current !== nextUrl) {
          isPlayingRef.current = false;
          return;
        }
        a.addEventListener("canplay", retryPlayOnce, { once: true });
        a.addEventListener("loadedmetadata", retryPlayOnce, { once: true });
      });
    }
    setQueueLength(audioQueueRef.current.length + decodedQueueRef.current.length);
  }, [updateBufferStatus]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const probeAudioDuration = useCallback((_blob: Blob, url: string): Promise<number> => {
    return new Promise((resolve) => {
      const probe = new Audio();
      const timeout = window.setTimeout(() => resolve(0), 1200);
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        const d = probe.duration;
        resolve(isFinite(d) ? d : 0);
      };
      probe.onerror = () => {
        window.clearTimeout(timeout);
        resolve(0);
      };
    });
  }, []);

  // djb2 hash of the first 4KB, mixed with byteLength. Used to
  // detect exact-byte duplicates in the WS stream — primarily
  // catches the ws-server replay-buffer drain on reconnect. Kept
  // outside the component so it doesn't capture any closures.
  // Collision probability per distinct chunk: ~1 in 4 billion
  // (32-bit djb2 + byteLength); safe for an audio stream where
  // chunks are unique by construction.
  const hashChunk = (buf: ArrayBuffer): string => {
    const sampleLen = Math.min(4096, buf.byteLength);
    const view = new Uint8Array(buf, 0, sampleLen);
    let h = 5381;
    for (let i = 0; i < sampleLen; i++) {
      h = ((h << 5) + h + view[i]) | 0;
    }
    return h.toString(36) + ":" + buf.byteLength;
  };

  const enqueueAudioBuffer = useCallback((buffer: ArrayBuffer) => {
    if (!desiredPlaybackRef.current || buffer.byteLength === 0 || !audioRef.current) return;
    // WS-reconnect dedup: reject chunks the client just played.
    // Catches the case where ws-server drains the replay buffer
    // (ws-server/index.ts:266-281) to a reconnecting client.
    // Hashing happens before any decode/push work so a duplicate
    // never costs CPU. The set is bounded (RECENT_HASH_CAP); on
    // stopPlayback/flush the set is cleared so legitimate replays
    // after a manual reset still queue. P0-2 also persists the
    // hashes to sessionStorage (debounced) so a page refresh doesn't
    // wipe the dedup window.
    const dedupSet = recentChunkHashesRef.current;
    const hash = hashChunk(buffer);
    if (dedupSet.has(hash)) {
      return;
    }
    dedupSet.add(hash);
    if (dedupSet.size > RECENT_HASH_CAP) {
      const oldest = dedupSet.values().next().value;
      if (oldest !== undefined) dedupSet.delete(oldest);
    }
    // Schedule a debounced write to sessionStorage. Coalescing
    // matters because chunks can arrive back-to-back during a
    // prebuffer drain (3-30 adds in a few ms) and we only need the
    // final state. Defer to a microtask-ish timeout. Errors
    // (private mode, quota) are swallowed inside persistDedup.
    persistDedup();
    const ctx = audioCtxRef.current;

    const afterQueued = () => {
      setQueueLength(audioQueueRef.current.length + decodedQueueRef.current.length);
      if (!hasStartedRef.current) {
        const ready = checkBufferReady().ready;
        if (ready) {
          hasStartedRef.current = true;
          playNext();
        } else {
          updateBufferStatus();
        }
      } else if (!isPlayingRef.current && (audioQueueRef.current.length > 0 || decodedQueueRef.current.length > 0)) {
        playNext();
      }
    };

    const enqueueHtmlAudio = () => {
      const bytes = new Uint8Array(buffer);
      const blob = new Blob([buffer], { type: detectAudioMime(bytes) });
      const blobUrl = URL.createObjectURL(blob);
      audioQueueRef.current.push(blobUrl);
      probeAudioDuration(blob, blobUrl).then(d => {
        durationQueueRef.current.push(d);
        updateBufferStatus();
        if (!hasStartedRef.current) {
          if (checkBufferReady().ready) {
            hasStartedRef.current = true;
            playNext();
          }
        } else if (!isPlayingRef.current && audioQueueRef.current.length > 0) {
          playNext();
        }
      });
      afterQueued();
    };

    if (!ctx) {
      enqueueHtmlAudio();
      return;
    }

    decodeAudioDataCompat(ctx, buffer)
      .then(decoded => {
        decodedQueueRef.current.push(decoded);
        durationQueueRef.current.push(decoded.duration);
        updateBufferStatus();
        afterQueued();
      })
      .catch(enqueueHtmlAudio);
  }, [checkBufferReady, persistDedup, playNext, probeAudioDuration, updateBufferStatus]);

  // === Connect audio WS ===
  //
  // The audio socket mirrors the message-socket retry pattern: open
  // fails or server closes → wait with exponential backoff (1s, 2s, 4s,
  // …, cap 15s) and reconnect. On iOS Safari the page can come back from
  // the background with a zombie socket; the next time the browser
  // surfaces `onclose` (or our `visibilitychange` handler sees
  // `connected === false` while we believe we're playing), this loop
  // heals the link without a page reload.
  //
  // Defined BEFORE startPlayback so the latter's exhaustive-deps lint
  // rule is satisfied without resorting to ignore comments.
  const connectAudioSocket = useCallback((themeId: string) => {
    if (typeof window === "undefined") return;
    // Idempotency guard: close any existing socket before opening a
    // new one. Without this, two call sites can race and produce
    // dual /audio sockets that each drain the server's replay
    // buffer (and compete for live broadcasts). The server has no
    // way to distinguish a "reconnect" from a "fresh" client, so the
    // duplicate drain is the only protection against double-play.
    // Sources of the race:
    //   - socket.onclose schedules a setTimeout-reconnect (1→15s)
    //     and concurrently the visibilitychange force-reconnect
    //     (page.tsx below) runs while the socket is in CLOSING.
    //   - startPlayback() may be invoked from both the autostart
    //     effect and the pageshow cold-start recovery in the same
    //     tick.
    // Closing the existing socket first ensures we never have more
    // than one /audio connection per browser tab. Repeating
    // .close() on an already-CLOSED socket is a no-op so this is
    // also safe to call when nothing useful is open.
    const existing = socketRef.current;
    if (existing && existing.readyState <= WebSocket.OPEN) {
      try {
        existing.close();
      } catch {
        /* socket may have already errored; ignore */
      }
      // Drop any pending retry timer so the OLD socket's onclose
      // doesn't fire after we've moved on and create yet another
      // socket a few hundred ms later.
      if (audioSocketRetryRef.current) {
        clearTimeout(audioSocketRetryRef.current);
        audioSocketRetryRef.current = null;
      }
    }
    socketRef.current = null;
    // Same base as the message socket — see the comment there about
    // NEXT_PUBLIC_WS_URL.
    const wsUrl = `${wsBaseUrl()}/audio?themeId=${themeId}`;
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    socket.onopen = () => {
      setConnected(true);
      // Reset backoff on a successful handshake so the next failure
      // starts the backoff sequence from 1s again.
      audioSocketBackoffRef.current = 1000;

      // Arm heartbeat (forward-compat ping) + watchdog (60s of
      // silence → force-close → existing onclose retry loop).
      // The watchdog is what actually catches silent drops today
      // (NAT timeout, idle proxy kill, server stalled without
      // close). The heartbeat ping is a no-op against the current
      // server but prepares us for one that echoes it. Both are
      // torn down in onclose and in stopPlayback.
      if (audioSocketHeartbeatRef.current) {
        clearInterval(audioSocketHeartbeatRef.current);
      }
      audioSocketHeartbeatRef.current = setInterval(() => {
        const s = socketRef.current;
        if (s && s.readyState === WebSocket.OPEN) {
          try {
            s.send(JSON.stringify({ type: "ping", t: Date.now() }));
          } catch {
            /* socket may have just closed; ignore */
          }
        }
      }, 20_000);
      if (audioSocketWatchdogRef.current) {
        clearTimeout(audioSocketWatchdogRef.current);
      }
      audioSocketWatchdogRef.current = setTimeout(() => {
        console.warn(
          "[audio-ws] watchdog timeout (60s no message), forcing close",
        );
        const s = socketRef.current;
        if (s && s.readyState <= WebSocket.OPEN) {
          try {
            s.close();
          } catch {
            /* ignore */
          }
        }
      }, 60_000);
    };
    socket.onclose = () => {
      setConnected(false);
      socketRef.current = null;
      // Tear down heartbeat + watchdog so they don't fire against
      // the closed socket (or worse, leak across reconnects).
      if (audioSocketHeartbeatRef.current) {
        clearInterval(audioSocketHeartbeatRef.current);
        audioSocketHeartbeatRef.current = null;
      }
      if (audioSocketWatchdogRef.current) {
        clearTimeout(audioSocketWatchdogRef.current);
        audioSocketWatchdogRef.current = null;
      }
      // Only retry if the user hasn't explicitly stopped playback.
      if (!desiredPlaybackRef.current) return;
      const delay = audioSocketBackoffRef.current;
      audioSocketBackoffRef.current = Math.min(delay * 2, 15_000);
      audioSocketRetryRef.current = setTimeout(() => {
        audioSocketRetryRef.current = null;
        // Self-reference is intentional — this is the reconnect arm of
        // the function itself. The React Hooks compiler linter can't
        // follow the recursive closure; at runtime `connectAudioSocket`
        // is bound to the latest closure produced by useCallback (the
        // linter is concerned about stale closures, which is not an
        // issue here because themeId is captured by value and
        // connectAudioSocket is recreated only on stable dependency
        // changes).
        // eslint-disable-next-line react-hooks/immutability
        connectAudioSocket(themeId);
      }, delay);
    };
    socket.onerror = () => {};
    socket.onmessage = (e) => {
      // Re-arm watchdog: any inbound message (string control,
      // binary audio chunk, even a ping echo) resets the 60s
      // silent-drop timer. Without this re-arm, a steady stream
      // of binary chunks would still trip the watchdog because
      // it's anchored to the open event, not the most recent
      // message.
      if (audioSocketWatchdogRef.current) {
        clearTimeout(audioSocketWatchdogRef.current);
      }
      audioSocketWatchdogRef.current = setTimeout(() => {
        console.warn(
          "[audio-ws] watchdog timeout (60s no message), forcing close",
        );
        const s = socketRef.current;
        if (s && s.readyState <= WebSocket.OPEN) {
          try {
            s.close();
          } catch {
            /* ignore */
          }
        }
      }, 60_000);
      if (typeof e.data === "string") {
        if (e.data === "flush" || e.data.startsWith('{"type":"flush"}')) {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          if (webAudioSourceRef.current) {
            try { webAudioSourceRef.current.stop(); } catch {}
            try { webAudioSourceRef.current.disconnect(); } catch {}
            webAudioSourceRef.current = null;
          }
          for (const url of audioQueueRef.current) URL.revokeObjectURL(url);
          audioQueueRef.current = [];
          decodedQueueRef.current = [];
          durationQueueRef.current = [];
          // Flush resets the dedup window — any subsequent audio
          // (e.g. after engine restart on a new theme) is treated as
          // fresh and not skipped. P0-2: also wipe the sessionStorage
          // copy so the next session doesn't carry stale hashes.
          recentChunkHashesRef.current.clear();
          clearPersistedDedup();
          isPlayingRef.current = false;
          hasStartedRef.current = false;
          setQueueLength(0);
          updateBufferStatus();
          return;
        }
        if (e.data.startsWith('{"type":"replay_end"}')) {
          return;
        }
        return;
      }
      if (e.data instanceof ArrayBuffer) {
        enqueueAudioBuffer(e.data);
      } else if (e.data instanceof Blob) {
        readBlobAsArrayBuffer(e.data).then(enqueueAudioBuffer).catch(() => {});
      }
    };
  }, [clearPersistedDedup, enqueueAudioBuffer, updateBufferStatus]);

  // Keep connectAudioSocketRef populated as the callback's identity
  // changes. Mirrors the playNextRef / startPlaybackRef pattern.
  // Placed here (after the useCallback) because the forward
  // reference from the visibilitychange useEffect above would
  // otherwise hit a TypeScript temporal-dead-zone error.
  useEffect(() => {
    connectAudioSocketRef.current = connectAudioSocket;
  }, [connectAudioSocket]);

  const startPlayback = useCallback(async () => {
    if (!audioRef.current) return;
    const ready = await ensureAudioReady();
    if (!ready) return;
    const t = await fetch("/api/config").then(r => r.json()).catch(() => null);
    if (!t) return;
    // eslint-disable-next-line react-hooks/immutability
    desiredPlaybackRef.current = true;
    writeDesiredPlayback(true);
    audioSocketBackoffRef.current = 1000;
    currentThemeIdRef.current = t.id;
    connectAudioSocket(t.id);
    setIsPlaying(true);
    // Tell the engine a client is now playing. fire-and-forget; the
    // 5s stats poller is the ultimate source of truth for online
    // count, so a missed POST just delays resume by up to 5s.
    fetch("/api/live/playing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playing: true, clientId: getOrCreateClientId() }),
    }).catch(() => {});
  }, [connectAudioSocket, ensureAudioReady]);

  // Keep the ref populated as `startPlayback`'s identity changes.
  // Mirrors the playNextRef pattern at line 1055.
  useEffect(() => {
    startPlaybackRef.current = startPlayback;
  }, [startPlayback]);

  const stopPlayback = useCallback(() => {
    // Clear any pending audio-WS retry (Fix #6) — otherwise a reconnect
    // scheduled by the previous socket's onclose would fire after the
    // user already tapped STOP, opening a fresh socket the user didn't ask for.
    if (audioSocketRetryRef.current) {
      clearTimeout(audioSocketRetryRef.current);
      audioSocketRetryRef.current = null;
    }
    // Tear down heartbeat + watchdog. The onclose handler also
    // does this, but stopPlayback closes the socket with
    // desiredPlaybackRef=false (so onclose skips its reconnect
    // branch); without an explicit cleanup here the timers could
    // outlive the socket reference and fire against socketRef
    // pointing at the *next* socket — false-positive watchdog
    // closes during a brief PLAY→STOP→PLAY cycle.
    if (audioSocketHeartbeatRef.current) {
      clearInterval(audioSocketHeartbeatRef.current);
      audioSocketHeartbeatRef.current = null;
    }
    if (audioSocketWatchdogRef.current) {
      clearTimeout(audioSocketWatchdogRef.current);
      audioSocketWatchdogRef.current = null;
    }
    // eslint-disable-next-line react-hooks/immutability
    desiredPlaybackRef.current = false;
    writeDesiredPlayback(false);
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (webAudioSourceRef.current) {
      try { webAudioSourceRef.current.stop(); } catch {}
      try { webAudioSourceRef.current.disconnect(); } catch {}
      webAudioSourceRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    for (const url of audioQueueRef.current) URL.revokeObjectURL(url);
    audioQueueRef.current = [];
    decodedQueueRef.current = [];
    durationQueueRef.current = [];
    // Reset dedup window so the next PLAY→STOP→PLAY cycle doesn't
    // skip the first chunks of the resumed stream. P0-2: also wipe
    // the sessionStorage copy — the user pressed STOP, so they
    // expect a fresh playback on next PLAY.
    recentChunkHashesRef.current.clear();
    clearPersistedDedup();
    hasStartedRef.current = false;
    isPlayingRef.current = false;
    setQueueLength(0);
    updateBufferStatus();
    setIsPlaying(false);
    // Tell the engine this client has stopped playing. Other clients
    // (different clientId) keep their entry in the engine's
    // playingClients set, so the engine keeps generating for them.
    // When the last listener stops, the set empties and the engine
    // pauses on its next 5s poll tick.
    fetch("/api/live/playing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playing: false, clientId: getOrCreateClientId() }),
    }).catch(() => {});
  }, [clearPersistedDedup, updateBufferStatus]);

  const togglePlay = useCallback(() => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  // === Enter: setup AudioContext + analyser, then autostart ===
  const handleEnter = useCallback(async () => {
    if (!audioRef.current) {
      // audio element not mounted yet — retry next frame
      requestAnimationFrame(() => {
        void ensureAudioReady().then((ready) => {
          if (ready) {
            shouldAutoStartRef.current = true;
          } else {
            setShowEnter(false);
            setHasEntered(true);
          }
        });
      });
      return;
    }
    const ready = await ensureAudioReady();
    if (ready) {
      shouldAutoStartRef.current = true;
    } else {
      // Still close the overlay so user isn't stuck
      setShowEnter(false);
      setHasEntered(true);
    }
  }, [ensureAudioReady]);

  // === Autostart after entering (only once) ===
  useEffect(() => {
    if (hasEntered && shouldAutoStartRef.current && !isPlaying) {
      shouldAutoStartRef.current = false;
      startPlayback();
    }
  }, [hasEntered, isPlaying, startPlayback]);

  // === Submit message ===
  const submitMessage = useCallback(async (form: { content: string; authorName: string }) => {
    if (!form.content.trim()) return;
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    submittedIdRef.current = data.id;
    setSubmissionStatus("pending");
  }, []);

  // === Volume slider ===
  const onVolumeChange = useCallback((v: number) => {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    if (audioGainRef.current) audioGainRef.current.gain.value = v;
  }, []);

  // === Audio ended → next ===
  // Bug #1 fix: this handler no longer POSTs playing=false. The
  // HTML audio path runs segments back-to-back via playNext() and
  // never re-POSTs playing=true between segments, so a playing=false
  // here emptied the engine's playingClients set between every
  // segment. pauseCheck() then flipped true and the engine paused
  // permanently after the first segment. Real stop signals (STOP
  // button, pagehide, audio.onpause after 500ms debounce) still
  // POST playing=false via their own paths. The contract this fix
  // locks in is verified by the "Bug #1 contract" describe block
  // in src/__tests__/live-engine-pause.test.ts.
  const onAudioEnded = useCallback(() => {
    isPlayingRef.current = false;
    if (durationQueueRef.current.length > 0) durationQueueRef.current.shift();
    updateBufferStatus();
    playNext();
    fetch("/api/live/playback-complete", { method: "POST" }).catch(() => {});
  }, [playNext, updateBufferStatus]);

  const onAudioError = useCallback(() => {
    isPlayingRef.current = false;
    if (durationQueueRef.current.length > 0) durationQueueRef.current.shift();
    updateBufferStatus();
    playNext();
  }, [playNext, updateBufferStatus]);

  // === Prebuffer mode label ===
  const prebufferModeLabel = (() => {
    switch (bufferCfg.prebufferMode) {
      case "group": return "组";
      case "paragraph": return "段";
      default: return "句";
    }
  })();

  return (
    // Tailwind v4 migration: the 250-line <style> block is gone. The
    // .listen-page / .layout / .player-slot / .page-footer / .fab-stack /
    // .fab / .fab-icon / .fab-text classes are now utility classes.
    // Per-fab-variant state (cyan wall vs magenta input, idle vs active)
    // is composed via cn(). The .ios-install-hint block targeted a class
    // that no longer exists (IosInstallHint was migrated in Phase 1.1).
    <div className="relative z-[2] flex min-h-[100vh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 items-center justify-center px-3 py-1.5 sm:px-4 sm:py-2 md:max-w-full md:px-8 md:py-7 lg:max-w-[1600px] lg:px-10 lg:py-9 3xl:px-14 3xl:py-12 landscape-short:py-0.5 landscape-shorter:py-0">
        <div className="flex w-full min-h-0 items-center justify-center">
          {displayTheme === "mist" ? (
            <MinimalRadioPlayer
              theme={theme}
              isPlaying={isPlaying}
              connected={connected}
              volume={volume}
              bufferStatus={bufferStatus}
              queueLength={queueLength}
              prebufferModeLabel={prebufferModeLabel}
              analyser={analyser}
              onTogglePlay={togglePlay}
              onVolumeChange={onVolumeChange}
            />
          ) : (
            <RadioPlayer
              theme={theme}
              isPlaying={isPlaying}
              connected={connected}
              volume={volume}
              bufferStatus={bufferStatus}
              queueLength={queueLength}
              prebufferModeLabel={prebufferModeLabel}
              analyser={analyser}
              onTogglePlay={togglePlay}
              onVolumeChange={onVolumeChange}
            />
          )}
        </div>
      </main>

      {/* Two mutually-exclusive floating action buttons (always visible) */}
      {messageFrontendVisible && (
      <>
      <div className="fixed right-[max(14px,env(safe-area-inset-right,14px))] bottom-[max(14px,env(safe-area-inset-bottom,14px))] z-50 flex flex-row items-end gap-2.5 md:right-6 md:bottom-6 md:gap-3 lg:right-8 lg:bottom-8 lg:gap-3.5 max-xs:right-3 max-xs:bottom-3 max-xs:gap-2 landscape-short:right-2.5 landscape-short:bottom-2.5">
        {/* iOS 14.6 (iPhone 7) touch-event fix.
            The outer container has `z-50` but the buttons are static-
            positioned children — on iOS Safari 14.6 the z-index does NOT
            propagate to static children, so a `backdrop-filter` (or any
            composited layer) drawn later can intercept touch events and
            the tap never reaches the handler. Three fixes per button:
              1) `type="button"` — prevents any future form-ancestor
                 accidental submit
              2) `style={{ position: "relative", zIndex: 1 }}` — gives
                 the button its own stacking context, lifts it above
                 the container's z-50 sibling layer
              3) drop `backdrop-blur-[16px]` — iOS 14.6 has a known
                 GPU-compositor quirk where backdrop-filter on a
                 hit-test target can swallow the first tap */}
        <button
          type="button"
          onClick={toggleWall}
          aria-label={`${wallOpen ? "Hide" : "Show"} message panel`}
          aria-pressed={wallOpen}
          style={{ position: "relative", zIndex: 1 }}
          className={cn(
            displayTheme === "mist"
              ? "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-pill border border-[rgba(95,144,197,0.14)] bg-white/84 px-3.5 py-0 text-[11px] font-medium tracking-[0.08em] text-[#5f718b] shadow-[0_12px_30px_rgba(111,136,167,0.16)] transition-all duration-[250ms] ease-out-soft hover:-translate-y-0.5 hover:bg-white"
              : "inline-flex cursor-pointer items-center justify-center gap-0 rounded-pill bg-[rgba(13,13,24,0.75)] px-0 py-0 text-xs font-medium tracking-[0.18em] text-neon-cyan shadow-[0_0_20px_rgba(0,240,255,0.3),0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-[250ms] ease-out-soft min-h-[44px] min-w-[44px] w-[44px] h-[44px] hover:-translate-y-0.5 hover:bg-[rgba(0,240,255,0.1)] hover:shadow-[0_0_32px_rgba(0,240,255,0.5),0_12px_40px_rgba(0,0,0,0.5)]",
            displayTheme === "mist"
              ? wallOpen && "border-[rgba(95,144,197,0.28)] bg-white text-[#213047] shadow-[0_18px_36px_rgba(111,136,167,0.18)]"
              : wallOpen && "bg-[rgba(0,240,255,0.18)] text-bg-deep shadow-[0_0_24px_rgba(0,240,255,0.6)]",
          )}
        >
          <span aria-hidden className="text-[16px]">{wallOpen ? "✕" : "💬"}</span>
          <span className={displayTheme === "mist" ? "inline" : "hidden"}>
            {wallOpen ? "HIDE" : "VIEW"}
          </span>
        </button>
        <button
          type="button"
          onClick={toggleInput}
          aria-label={`${inputOpen ? "Hide" : "Show"} message input`}
          aria-pressed={inputOpen}
          style={{ position: "relative", zIndex: 1 }}
          className={cn(
            displayTheme === "mist"
              ? "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-pill border border-[rgba(95,144,197,0.14)] bg-white/84 px-3.5 py-0 text-[11px] font-medium tracking-[0.08em] text-[#5f718b] shadow-[0_12px_30px_rgba(111,136,167,0.16)] transition-all duration-[250ms] ease-out-soft hover:-translate-y-0.5 hover:bg-white"
              : "inline-flex cursor-pointer items-center justify-center gap-0 rounded-pill bg-[rgba(13,13,24,0.75)] px-0 py-0 text-xs font-medium tracking-[0.18em] text-neon-magenta shadow-[0_0_20px_rgba(255,0,170,0.3),0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-[250ms] ease-out-soft min-h-[44px] min-w-[44px] w-[44px] h-[44px] hover:-translate-y-0.5 hover:bg-[rgba(255,0,170,0.1)] hover:shadow-[0_0_32px_rgba(255,0,170,0.5),0_12px_40px_rgba(0,0,0,0.5)]",
            displayTheme === "mist"
              ? inputOpen && "border-[rgba(95,144,197,0.28)] bg-white text-[#213047] shadow-[0_18px_36px_rgba(111,136,167,0.18)]"
              : inputOpen && "bg-[rgba(255,0,170,0.2)] text-bg-deep shadow-[0_0_24px_rgba(255,0,170,0.6)]",
          )}
        >
          <span aria-hidden className="text-[16px]">{inputOpen ? "✕" : "✏️"}</span>
          <span className={displayTheme === "mist" ? "inline" : "hidden"}>
            {inputOpen ? "CLOSE" : "SIGNAL"}
          </span>
        </button>
        <button
          type="button"
          onClick={toggleSettings}
          aria-label={settingsOpen ? "Close theme settings" : "Open theme settings"}
          aria-pressed={settingsOpen}
          style={{ position: "relative", zIndex: 1 }}
          className={cn(
            displayTheme === "mist"
              ? "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-pill border border-[rgba(95,144,197,0.14)] bg-white px-3.5 py-0 text-[11px] font-medium tracking-[0.08em] text-[#213047] shadow-[0_12px_30px_rgba(111,136,167,0.16)] transition-all duration-[250ms] ease-out-soft hover:-translate-y-0.5"
              : "inline-flex cursor-pointer items-center justify-center gap-0 rounded-pill bg-[rgba(13,13,24,0.75)] px-0 py-0 text-xs font-medium tracking-[0.18em] text-neon-violet shadow-[0_0_20px_rgba(138,43,255,0.3),0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-[250ms] ease-out-soft min-h-[44px] min-w-[44px] w-[44px] h-[44px] hover:-translate-y-0.5 hover:bg-[rgba(138,43,255,0.1)] hover:shadow-[0_0_32px_rgba(138,43,255,0.5),0_12px_40px_rgba(0,0,0,0.5)]",
            displayTheme === "mist"
              ? settingsOpen && "border-[rgba(95,144,197,0.28)] shadow-[0_18px_36px_rgba(111,136,167,0.18)]"
              : settingsOpen && "bg-[rgba(138,43,255,0.2)] text-bg-deep shadow-[0_0_24px_rgba(138,43,255,0.6)]",
          )}
        >
          <span aria-hidden className="text-[16px]">{settingsOpen ? "×" : "◌"}</span>
          <span className={displayTheme === "mist" ? "inline" : "hidden"}>Theme</span>
        </button>
      </div>
      <div
        className={cn(
          displayTheme === "mist"
            ? "fixed right-[max(14px,env(safe-area-inset-right,14px))] bottom-[calc(max(14px,env(safe-area-inset-bottom,14px))+58px)] z-[55] w-[min(320px,calc(100vw-28px))] rounded-[28px] border border-[rgba(95,144,197,0.14)] bg-[rgba(255,255,255,0.88)] p-4 shadow-[0_26px_70px_rgba(111,136,167,0.18)] backdrop-blur-[24px] transition-all duration-300 ease-out-soft md:right-6 md:bottom-[88px] lg:right-8 lg:bottom-[96px]"
            : "fixed right-[max(14px,env(safe-area-inset-right,14px))] bottom-[calc(max(14px,env(safe-area-inset-bottom,14px))+58px)] z-[55] w-[min(320px,calc(100vw-28px))] rounded-[24px] border border-white/12 bg-[rgba(10,14,26,0.82)] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-[22px] transition-all duration-300 ease-out-soft md:right-6 md:bottom-[88px] lg:right-8 lg:bottom-[96px]",
          !settingsOpen && "pointer-events-none translate-y-4 opacity-0",
          settingsOpen && "translate-y-0 opacity-100",
        )}
      >
        <div className="mb-2">
          <div className={cn("font-display text-sm font-semibold tracking-[0.08em]", displayTheme === "mist" ? "text-[#213047]" : "text-text-primary")}>Display Theme</div>
          <div className={cn("mt-1 text-xs leading-5", displayTheme === "mist" ? "text-[#5f718b]" : "text-text-secondary")}>Switch the front-end look only. Live content and admin theme stay unchanged.</div>
        </div>
        <div className="flex flex-col gap-2">
          {DISPLAY_THEME_OPTIONS.map((option) => {
            const active = option.id === displayTheme;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setDisplayTheme(option.id)}
                className={cn(
                  "w-full rounded-[18px] border px-4 py-3 text-left transition-all duration-200 ease-out-soft",
                  displayTheme === "mist"
                    ? active
                      ? "border-[rgba(95,144,197,0.24)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,244,249,0.92))] shadow-[0_16px_32px_rgba(111,136,167,0.14)]"
                      : "border-[rgba(95,144,197,0.1)] bg-white/70 hover:border-[rgba(95,144,197,0.2)] hover:bg-white"
                    : active
                      ? "border-neon-cyan/45 bg-[linear-gradient(135deg,rgba(0,240,255,0.18),rgba(255,255,255,0.06))] shadow-[0_0_24px_rgba(0,240,255,0.18)]"
                      : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.08]",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("font-display text-sm font-medium tracking-[0.04em]", displayTheme === "mist" ? "text-[#213047]" : "text-text-primary")}>{option.name}</span>
                  {active && <span className={cn("text-xs font-medium tracking-[0.12em]", displayTheme === "mist" ? "text-[#5f90c5]" : "text-neon-cyan")}>Active</span>}
                </div>
                <p className={cn("mt-1 text-xs leading-5", displayTheme === "mist" ? "text-[#5f718b]" : "text-text-secondary")}>{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>
      </>
      )}

        <span className="opacity-40">·</span>
        <span className="opacity-40">·</span>

      {displayTheme === "cyber" && (
        <footer className="fixed bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-2.5 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] font-mono text-[9px] tracking-[0.25em] text-text-dim sm:px-5 sm:py-3.5 sm:pb-[calc(14px+env(safe-area-inset-bottom,0px))] sm:text-[10px] md:px-8 md:py-[18px] md:pb-[calc(18px+env(safe-area-inset-bottom,0px))] md:text-[11px] lg:px-9 lg:py-[18px] lg:pb-[calc(18px+env(safe-area-inset-bottom,0px))] 3xl:px-12 3xl:py-5 3xl:pb-[calc(20px+env(safe-area-inset-bottom,0px))] 3xl:text-xs">
          <span>RADIO AI</span>
          <span>live broadcast system</span>
          <span>{new Date().getFullYear()}</span>
        </footer>
      )}

      {/* Hidden audio element (used by both Web Audio analyser and HTMLAudio)
       *
       * iOS Safari quirk fixes:
       * - `playsInline` — without it, iOS may force the native fullscreen
       *   player on `play()` if any ancestor ever loses `display: none`.
       *   We're safe today (`className="hidden"`), but `playsInline` is
       *   the durable fix.
       * - `crossOrigin="anonymous"` — required when feeding the element
       *   into `createMediaElementSource` so the resulting
       *   `MediaElementAudioSourceNode` is treated as a CORS-clean
       *   source. On iOS 14, missing this can leave the audio silent. */}
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        className="sr-only"
        onEnded={onAudioEnded}
        onError={onAudioError}
      />

      {/* Background media-session keepalive. <video> with srcObject fed
          from a combined MediaStream (2x2 canvas video track + silent
          OscillatorNode audio track, attached in ensureAudioReady).
          Both tracks active → strongest "active media" signal for
          Chromium / Edge / iOS Safari, prevents the JS context +
          WebSocket from being frozen when the screen is off. Muted +
          autoplay + sr-only; no visible pixels, status-bar icon
          minimal on iOS. */}
      <video
        ref={keepaliveVideoRef}
        muted
        loop
        autoPlay
        playsInline
        aria-hidden="true"
        className="sr-only"
      />

      {/* Translucent right-side wall panel (toggleable, mutually exclusive with drawer) */}
      {messageFrontendVisible && (
      <MessageWallPanel
        open={wallOpen}
        onToggle={toggleWall}
        messages={wallMessages}
        speedSeconds={scrollSpeedSeconds}
        variant={displayTheme}
      />
      )}

      {/* Translucent input drawer (toggleable, mutually exclusive with wall panel) */}
      {messageFrontendVisible && (
      <MessageInputDrawer
        open={inputOpen}
        onToggle={toggleInput}
        onSubmit={submitMessage}
        submissionStatus={submissionStatus}
        variant={displayTheme}
      />
      )}

      {/* First-visit overlay (only when not yet entered) */}
      <EnterOverlay visible={showEnter && !hasEntered} onEnter={handleEnter} />

      {/* iOS Safari install nudge. Self-suppresses once dismissed or
          when the page is already running as an installed PWA. */}
      <IosInstallHint isPlaying={isPlaying} />

      {/* In-app WebView (WeChat / QQ / generic wv) audio-loss nudge.
          Renders on top of IosInstallHint (z-[61] vs z-[60]) because
          the "open in browser" action is more urgent than PWA install
          when the user is already trapped in a WebView. */}
      <WebViewAudioHint isPlaying={isPlaying} />

      {/* Mobile-only pill showing the current Wake Lock state
          (active / failed / unsupported). Hidden on desktop and
          when audio is not playing. Self-dismisses per device via
          localStorage. */}
      <WakeLockIndicator status={wakeLockStatus} isPlaying={isPlaying} />

      {/* Re-prime failure toast: surfaces after the audio pause
          re-prime has failed 3x within 5s. The onClick counts as a
          real user gesture, which iOS requires for AudioContext
          resume after Siri/FaceTime interruption, so this is the
          cleanest way to recover. Auto-dismisses after 8s. */}
      {reprimeToastVisible && (
        <button
          type="button"
          onClick={() => {
            audioRef.current?.play().catch(() => {});
            setReprimeToastVisible(false);
          }}
          // iOS 14.6 touch-event fix: same as WakeLockIndicator pill —
          // backdrop-blur on a hit-test target swallows the first
          // tap. Drop the blur (the 92% opaque background already
          // gives the visual) and give the button its own stacking
          // context so a sibling composited layer can't reorder it.
          style={{ position: "relative", zIndex: 1 }}
          className="fixed bottom-[max(80px,calc(60px+env(safe-area-inset-bottom,0px)))]
                     left-1/2 z-[65] -translate-x-1/2 cursor-pointer
                     rounded-full border border-[rgba(140,160,255,0.3)]
                     bg-[rgba(13,13,24,0.92)] px-4 py-2 text-sm
                     text-[#e0e2ff] transition-opacity hover:opacity-90"
          aria-label="音频被其他应用暂停，点此恢复"
        >
          音频被其他应用暂停，点此恢复
        </button>
      )}
    </div>
  );
}
