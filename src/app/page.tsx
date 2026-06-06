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
    <div className="listen-page">
      <main className="layout">
        <div className="player-slot">
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
      <div className="fab-stack">
        <button
          className={`fab ${wallOpen ? "active" : ""}`}
          onClick={toggleWall}
          aria-label={`${wallOpen ? "Hide" : "Show"} message panel`}
          aria-pressed={wallOpen}
        >
          <span className="fab-icon" aria-hidden>{wallOpen ? "✕" : "💬"}</span>
          <span className="fab-text display">{wallOpen ? "HIDE" : "VIEW"}</span>
        </button>
        <button
          className={`fab input-fab ${inputOpen ? "active" : ""}`}
          onClick={toggleInput}
          aria-label={`${inputOpen ? "Hide" : "Show"} message input`}
          aria-pressed={inputOpen}
        >
          <span className="fab-icon" aria-hidden>{inputOpen ? "✕" : "✏️"}</span>
          <span className="fab-text display">{inputOpen ? "CLOSE" : "SIGNAL"}</span>
        </button>
      </div>
      )}

      <footer className="page-footer mono">
        <span>RADIO AI</span>
        <span className="footer-sep">·</span>
        <span>live broadcast system</span>
        <span className="footer-sep">·</span>
        <span>{new Date().getFullYear()}</span>
      </footer>

      {/* Hidden audio element (used by both Web Audio analyser and HTMLAudio) */}
      <audio
        ref={audioRef}
        preload="auto"
        style={{ display: "none" }}
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

      <style>{`
        .listen-page {
          position: relative;
          z-index: 2;
          height: 100vh;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .layout {
          flex: 1 1 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px 12px 90px;
          padding-bottom: calc(90px + env(safe-area-inset-bottom, 0px));
          max-width: 1400px;
          width: 100%;
          margin: 0 auto;
          min-height: 0;
        }
        .player-slot {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 0;
          width: 100%;
        }

        .page-footer {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
          font-size: 9px;
          letter-spacing: 0.25em;
          color: var(--text-dim);
          flex-wrap: wrap;
        }
        .footer-sep { opacity: 0.4; }

        /* === FAB stack (2 independent buttons) === */
        .fab-stack {
          position: fixed;
          right: max(14px, env(safe-area-inset-right, 14px));
          bottom: max(14px, env(safe-area-inset-bottom, 14px));
          z-index: 50;
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: flex-end;
        }
        .fab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 18px;
          background: rgba(13, 13, 24, 0.75);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1.5px solid var(--neon-cyan);
          color: var(--neon-cyan);
          border-radius: var(--radius-pill);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.18em;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4);
          transition: all 0.25s var(--ease-out);
          min-height: 44px;
          min-width: 132px;          /* equal-width for both VIEW & SIGNAL */
          justify-content: center;
        }
        .fab:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 32px rgba(0, 240, 255, 0.5), 0 12px 40px rgba(0, 0, 0, 0.5);
          background: rgba(0, 240, 255, 0.1);
        }
        .fab.active {
          background: rgba(0, 240, 255, 0.18);
          color: var(--bg-deep);
          border-color: var(--neon-cyan);
          box-shadow: 0 0 24px rgba(0, 240, 255, 0.6);
        }
        .fab.input-fab {
          border-color: var(--neon-magenta);
          color: var(--neon-magenta);
          box-shadow: 0 0 20px rgba(255, 0, 170, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4);
        }
        .fab.input-fab:hover {
          background: rgba(255, 0, 170, 0.1);
          box-shadow: 0 0 32px rgba(255, 0, 170, 0.5), 0 12px 40px rgba(0, 0, 0, 0.5);
        }
        .fab.input-fab.active {
          background: rgba(255, 0, 170, 0.2);
          color: var(--bg-deep);
          box-shadow: 0 0 24px rgba(255, 0, 170, 0.6);
        }
        .fab-icon { font-size: 14px; }
        .fab-text {
          /* Explicit display font + size so both VIEW/HIDE and SIGNAL/CLOSE
             render identically regardless of which span-class order wins
             the cascade. */
          font-family: var(--font-display);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.2em;
          line-height: 1;
          opacity: 0.75;             /* subtle, less shouting */
          flex: 0 0 auto;
          text-align: center;
          min-width: 56px;          /* equal text-block width */
        }

        /* --- Breakpoints --- */
        @media (min-width: 480px) {
          .layout { padding: 12px 16px 96px; }
          .page-footer { font-size: 10px; padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px)); }
        }

        /* === Tablet portrait (iPad 9.7/10.2/10.9, 768-1023px) === */
        @media (min-width: 768px) {
          .layout {
            padding: 28px 32px 40px;
            max-width: 100%;
          }
          .page-footer { font-size: 11px; padding: 18px 32px calc(18px + env(safe-area-inset-bottom, 0px)); }
          .fab {
            padding: 13px 22px;
            font-size: 13px;
            min-height: 46px;
            min-width: 150px;
          }
          .fab-text { font-size: 13px; min-width: 64px; }
          .fab-icon { font-size: 15px; }
          .fab-stack { right: 24px; bottom: 24px; gap: 12px; }
        }

        /* === Tablet landscape (iPad 1024-1365) / small desktop === */
        @media (min-width: 1024px) {
          .layout {
            padding: 36px 40px 48px;
            /* Three-column grid: left breathing space | player | right rail.
               The player sits in the center column; side panels are siblings
               in the page-level positioning. */
            max-width: 1600px;
          }
          .page-footer { font-size: 11px; padding: 18px 36px calc(18px + env(safe-area-inset-bottom, 0px)); }
          .fab {
            padding: 14px 24px;
            font-size: 13px;
            min-height: 48px;
            min-width: 160px;
          }
          .fab-text { font-size: 13px; min-width: 68px; }
          .fab-icon { font-size: 16px; }
          .fab-stack { right: 32px; bottom: 32px; gap: 14px; }
        }

        /* === Wide desktop (>= 1366px) === */
        @media (min-width: 1366px) {
          .layout { padding: 48px 56px 56px; }
          .page-footer { font-size: 12px; padding: 20px 48px calc(20px + env(safe-area-inset-bottom, 0px)); }
          .fab { padding: 14px 28px; font-size: 14px; min-width: 170px; }
          .fab-text { font-size: 14px; min-width: 72px; }
        }

        @media (max-width: 380px) {
          .fab { padding: 10px 14px; font-size: 11px; min-height: 40px; min-width: 110px; }
          .fab-stack { right: 12px; bottom: 12px; gap: 8px; }
        }

        /* iPhone landscape (375-430pt high): vertical space is precious.
           Switch to icon-only FABs and put them in a row at bottom-right
           so neither is occluded by the player's visualizer. */
        @media (orientation: landscape) and (max-height: 500px) {
          .fab-stack {
            right: 12px;
            bottom: 12px;
            flex-direction: row;
            gap: 8px;
          }
          .fab {
            padding: 10px 12px;
            font-size: 11px;
            min-height: 40px;
            min-width: 0;
            width: 44px;
            justify-content: center;
            gap: 0;
          }
          .fab-text { display: none; }   /* hide text in landscape, icon only */
        }

        /* Tablet landscape (iPad) — there's enough vertical room for the
           full text labels, so undo the icon-only override above. */
        @media (orientation: landscape) and (min-width: 768px) and (max-height: 500px) {
          .fab {
            width: auto;
            min-width: 130px;
            padding: 11px 18px;
            gap: 8px;
          }
          .fab-text { display: inline; font-size: 12px; min-width: 56px; }
        }

        /* iOS Safari install nudge — pinned to the top of the viewport
           so it never overlaps the player or FABs. Sits above the FAB
           stack (z 50) but below the input drawer (z 70) so a focused
           drawer covers it. */
        .ios-install-hint {
          position: fixed;
          top: max(12px, env(safe-area-inset-top, 12px));
          left: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: rgba(13, 13, 24, 0.92);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(140, 160, 255, 0.3);
          border-radius: 10px;
          color: #e0e2ff;
          font-size: 14px;
          line-height: 1.4;
          z-index: 60;
          pointer-events: auto;
        }
        .ios-install-hint button {
          background: none;
          border: 0;
          color: inherit;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 4px 8px;
          margin-left: auto;
        }
        @media (min-width: 768px) {
          .ios-install-hint {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            max-width: 540px;
          }
        }
      `}</style>
    </div>
  );
}
