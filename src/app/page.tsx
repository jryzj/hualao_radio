"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { RadioPlayer } from "@/components/RadioPlayer";
import { type WallMessage } from "@/components/MessageWall";
import { MessageInputDrawer } from "@/components/MessageInputDrawer";
import { MessageWallPanel } from "@/components/MessageWallPanel";
import { EnterOverlay } from "@/components/EnterOverlay";
import { IosInstallHint } from "@/components/IosInstallHint";
import { wsBaseUrl } from "@/lib/ws-url";
import { useWakeLock } from "@/lib/wake-lock";
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
}

const DEFAULT_BUFFER_CFG: AudioBufferCfg = {
  prebufferSentences: 3,
  prebufferSeconds: 8,
  prebufferMode: "sentences",
  prebufferGroupSize: 3,
};

const ENTERED_KEY = "radioai.entered";

export default function Home() {
  // === Theme / config ===
  const [theme, setTheme] = useState<Theme | null>(null);
  const [bufferCfg, setBufferCfg] = useState<AudioBufferCfg>(DEFAULT_BUFFER_CFG);
  const bufferCfgRef = useRef<AudioBufferCfg>(DEFAULT_BUFFER_CFG);
  useEffect(() => { bufferCfgRef.current = bufferCfg; }, [bufferCfg]);

  // === Enter overlay (user-gesture required) ===
  const [hasEntered, setHasEntered] = useState(false);
  const [showEnter, setShowEnter] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const entered = window.localStorage.getItem(ENTERED_KEY) === "true";
    if (entered) {
      setHasEntered(true);
      setShowEnter(false);
    } else {
      setShowEnter(true);
    }
  }, []);

  // === Audio element + AudioContext + AnalyserNode ===
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // === Playback state ===
  const [isPlaying, setIsPlaying] = useState(false);
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const [queueLength, setQueueLength] = useState(0);
  const [bufferStatus, setBufferStatus] = useState<{ ready: boolean; sentences: number; seconds: number; needed: number }>({ ready: false, sentences: 0, seconds: 0, needed: 0 });
  // Flips true once the server has finished draining its replay buffer
  // to us and we are receiving live chunks. The audio queue/playNext
  // path doesn't branch on this — the replay and live chunks go through
  // the same code — but keeping the flag around means a future UI
  // ("TUNING IN…" → "LIVE") is a one-line change.
  const [replayComplete, setReplayComplete] = useState(false);

  const audioQueueRef = useRef<string[]>([]);
  const durationQueueRef = useRef<number[]>([]);
  const isPlayingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const currentUrlRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
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
  const toggleWall = useCallback(() => {
    setWallOpen(v => !v);
    setInputOpen(false);
  }, []);
  const toggleInput = useCallback(() => {
    setInputOpen(v => !v);
    setWallOpen(false);
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
    if (messageFrontendVisible) {
      fetch("/api/messages")
        .then(r => r.json())
        .then((list: WallMessage[]) => setWallMessages(list))
        .catch(() => {});
    }
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

  // When the admin changes the cap at runtime, reconcile the in-memory
  // list with the new limit:
  //   - shrink path (cap lowered): trim the oldest entries locally
  //   - grow path (cap raised): the local list is shorter than the new
  //     cap, so refetch from the server to fill it. /api/messages reads
  //     the current cap on every request, so a single GET returns up to
  //     the new limit and the wall re-renders at the new size.
  useEffect(() => {
    setWallMessages(prev => {
      if (prev.length > maxVisibleMessages) {
        return prev.slice(prev.length - maxVisibleMessages);
      }
      if (prev.length < maxVisibleMessages && messageFrontendVisible) {
        fetch("/api/messages")
          .then(r => r.json())
          .then((list: WallMessage[]) => setWallMessages(list))
          .catch(() => {});
        return prev;
      }
      return prev;
    });
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
      navigator.mediaSession!.metadata = new MediaMetadata({
        title,
        artist: `Host: ${hostName}`,
        album: "Live Broadcast",
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
  useWakeLock(isPlaying || connected || bufferStatus.ready);

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
      if (isPlaying && a.paused) {
        a.play().catch(() => {});
      }
    };
    const onPageShow = () => {
      const a = audioRef.current;
      if (!a) return;
      if (isPlaying && a.paused) {
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

  // === Playback logic (preserved from original) ===
  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    if (audioQueueRef.current.length === 0) {
      hasStartedRef.current = false;
      return;
    }
    const nextUrl = audioQueueRef.current.shift();
    if (!nextUrl) return;
    if (!audioRef.current) return;
    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    currentUrlRef.current = nextUrl;
    audioRef.current.src = nextUrl;
    audioRef.current.volume = volumeRef.current;
    isPlayingRef.current = true;
    const p = audioRef.current.play();
    if (p) p.catch(() => {});
    setQueueLength(audioQueueRef.current.length);
  }, []);

  const checkBufferReady = useCallback((): { ready: boolean; sentences: number; seconds: number; needed: number } => {
    const cfg = bufferCfgRef.current;
    const sentences = audioQueueRef.current.length;
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

  const probeAudioDuration = (_blob: Blob, url: string): Promise<number> => {
    return new Promise((resolve) => {
      const probe = new Audio();
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => {
        const d = probe.duration;
        resolve(isFinite(d) ? d : 0);
      };
      probe.onerror = () => resolve(0);
    });
  };

  // === Connect audio WS ===
  const startPlayback = useCallback(async () => {
    if (!audioRef.current) return;
    const t = await fetch("/api/config").then(r => r.json()).catch(() => null);
    if (!t) return;
    // Same base as the message socket — see the comment there about
    // NEXT_PUBLIC_WS_URL.
    const wsUrl = `${wsBaseUrl()}/audio?themeId=${t.id}`;
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => {};
    socket.onmessage = (e) => {
      if (typeof e.data === "string") {
        if (e.data === "flush" || e.data.startsWith('{"type":"flush"}')) {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          audioQueueRef.current = [];
          durationQueueRef.current = [];
          isPlayingRef.current = false;
          hasStartedRef.current = false;
          setQueueLength(0);
          updateBufferStatus();
          return;
        }
        // Replay-to-late-joiners marker from ws-server: every chunk the
        // server buffered (last N from the live engine) has been
        // pushed to us; from here on we are receiving live chunks. The
        // queue logic is identical for replay vs live — both are binary
        // audio frames appended to audioQueueRef.current — so this
        // branch only flips a UI flag. Reset on stopPlayback below.
        if (e.data.startsWith('{"type":"replay_end"}')) {
          setReplayComplete(true);
          return;
        }
        return;
      }
      const byteLen = (e.data as ArrayBuffer).byteLength;
      if (byteLen === 0 || !audioRef.current) return;
      const blob = new Blob([e.data]);
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
      setQueueLength(audioQueueRef.current.length);
      if (!hasStartedRef.current) {
        const ready = checkBufferReady().ready;
        if (ready) {
          hasStartedRef.current = true;
          playNext();
        } else {
          updateBufferStatus();
        }
      } else if (!isPlayingRef.current && audioQueueRef.current.length > 0) {
        playNext();
      }
    };
    setIsPlaying(true);
  }, [checkBufferReady, playNext, updateBufferStatus]);

  const stopPlayback = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioQueueRef.current = [];
    durationQueueRef.current = [];
    hasStartedRef.current = false;
    isPlayingRef.current = false;
    setQueueLength(0);
    updateBufferStatus();
    setReplayComplete(false);
    setIsPlaying(false);
  }, [updateBufferStatus]);

  const togglePlay = useCallback(() => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  // === Enter: setup AudioContext + analyser, then autostart ===
  const handleEnter = useCallback(async () => {
    if (!audioRef.current) {
      // audio element not mounted yet — retry next frame
      requestAnimationFrame(() => handleEnter());
      return;
    }
    try {
      // Create AudioContext (must be inside user gesture)
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (!Ctx) throw new Error("Web Audio API not supported");
      const ctx = new Ctx();
      await ctx.resume();

      // Connect audio element to analyser
      // Guard: createMediaElementSource can only be called once per element.
      // If the user reloads the page we get a fresh element, so this is safe.
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.7;
      source.connect(analyserNode);
      analyserNode.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyserNode;
      setAnalyser(analyserNode);

      // Mark entered + autostart
      window.localStorage.setItem(ENTERED_KEY, "true");
      setHasEntered(true);
      setShowEnter(false);
      shouldAutoStartRef.current = true;
    } catch (err) {
      console.error("[enter] failed:", err);
      // Still close the overlay so user isn't stuck
      setShowEnter(false);
      setHasEntered(true);
    }
  }, []);

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
  }, []);

  // === Audio ended → next ===
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
    switch (bufferCfgRef.current.prebufferMode) {
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
    <div className="relative z-[2] flex min-h-[100dvh] flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 items-center justify-center px-3 py-1.5 sm:px-4 sm:py-2 md:max-w-full md:px-8 md:py-7 lg:max-w-[1600px] lg:px-10 lg:py-9 3xl:px-14 3xl:py-12 landscape-short:py-0.5 landscape-shorter:py-0">
        <div className="flex w-full min-h-0 items-center justify-center">
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
        </div>
      </main>

      {/* Two mutually-exclusive floating action buttons (always visible) */}
      {messageFrontendVisible && (
      <div className="fixed right-[max(14px,env(safe-area-inset-right,14px))] bottom-[max(14px,env(safe-area-inset-bottom,14px))] z-50 flex flex-col items-end gap-2.5 md:right-6 md:bottom-6 md:gap-3 lg:right-8 lg:bottom-8 lg:gap-3.5 max-xs:right-3 max-xs:bottom-3 max-xs:gap-2 landscape-short:right-2.5 landscape-short:bottom-2.5">
        <button
          onClick={toggleWall}
          aria-label={`${wallOpen ? "Hide" : "Show"} message panel`}
          aria-pressed={wallOpen}
          className={cn(
            "inline-flex cursor-pointer items-center justify-center gap-0 rounded-pill border-[1.5px] border-neon-cyan bg-[rgba(13,13,24,0.75)] px-0 py-0 text-xs font-medium tracking-[0.18em] text-neon-cyan backdrop-blur-[16px] shadow-[0_0_20px_rgba(0,240,255,0.3),0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-[250ms] ease-out-soft min-h-[44px] min-w-[44px] w-[44px] h-[44px] hover:-translate-y-0.5 hover:bg-[rgba(0,240,255,0.1)] hover:shadow-[0_0_32px_rgba(0,240,255,0.5),0_12px_40px_rgba(0,0,0,0.5)]",
            wallOpen && "border-neon-cyan bg-[rgba(0,240,255,0.18)] text-bg-deep shadow-[0_0_24px_rgba(0,240,255,0.6)]",
          )}
        >
          <span aria-hidden className="text-[16px]">{wallOpen ? "✕" : "💬"}</span>
          <span className="hidden">
            {wallOpen ? "HIDE" : "VIEW"}
          </span>
        </button>
        <button
          onClick={toggleInput}
          aria-label={`${inputOpen ? "Hide" : "Show"} message input`}
          aria-pressed={inputOpen}
          className={cn(
            "inline-flex cursor-pointer items-center justify-center gap-0 rounded-pill border-[1.5px] border-neon-magenta bg-[rgba(13,13,24,0.75)] px-0 py-0 text-xs font-medium tracking-[0.18em] text-neon-magenta backdrop-blur-[16px] shadow-[0_0_20px_rgba(255,0,170,0.3),0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-[250ms] ease-out-soft min-h-[44px] min-w-[44px] w-[44px] h-[44px] hover:-translate-y-0.5 hover:bg-[rgba(255,0,170,0.1)] hover:shadow-[0_0_32px_rgba(255,0,170,0.5),0_12px_40px_rgba(0,0,0,0.5)]",
            inputOpen && "bg-[rgba(255,0,170,0.2)] text-bg-deep shadow-[0_0_24px_rgba(255,0,170,0.6)]",
          )}
        >
          <span aria-hidden className="text-[16px]">{inputOpen ? "✕" : "✏️"}</span>
          <span className="hidden">
            {inputOpen ? "CLOSE" : "SIGNAL"}
          </span>
        </button>
      </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-2.5 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] font-mono text-[9px] tracking-[0.25em] text-text-dim sm:px-5 sm:py-3.5 sm:pb-[calc(14px+env(safe-area-inset-bottom,0px))] sm:text-[10px] md:px-8 md:py-[18px] md:pb-[calc(18px+env(safe-area-inset-bottom,0px))] md:text-[11px] lg:px-9 lg:py-[18px] lg:pb-[calc(18px+env(safe-area-inset-bottom,0px))] 3xl:px-12 3xl:py-5 3xl:pb-[calc(20px+env(safe-area-inset-bottom,0px))] 3xl:text-xs">
        <span>RADIO AI</span>
        <span className="opacity-40">·</span>
        <span>live broadcast system</span>
        <span className="opacity-40">·</span>
        <span>{new Date().getFullYear()}</span>
      </footer>

      {/* Hidden audio element (used by both Web Audio analyser and HTMLAudio) */}
      <audio
        ref={audioRef}
        preload="auto"
        className="hidden"
        onEnded={onAudioEnded}
        onError={onAudioError}
      />

      {/* Translucent right-side wall panel (toggleable, mutually exclusive with drawer) */}
      {messageFrontendVisible && (
      <MessageWallPanel
        open={wallOpen}
        onToggle={toggleWall}
        messages={wallMessages}
        speedSeconds={scrollSpeedSeconds}
      />
      )}

      {/* Translucent input drawer (toggleable, mutually exclusive with wall panel) */}
      {messageFrontendVisible && (
      <MessageInputDrawer
        open={inputOpen}
        onToggle={toggleInput}
        onSubmit={submitMessage}
        submissionStatus={submissionStatus}
      />
      )}

      {/* First-visit overlay (only when not yet entered) */}
      <EnterOverlay visible={showEnter && !hasEntered} onEnter={handleEnter} />

      {/* iOS Safari install nudge. Self-suppresses once dismissed or
          when the page is already running as an installed PWA. */}
      <IosInstallHint isPlaying={isPlaying} />
    </div>
  );
}
