import { prisma } from "@/lib/prisma";
import { getAudioBufferConfig, getLLMConfig, DEFAULT_AUDIO_BUFFER, type AudioBufferConfig } from "@/config";
import { moderateMessage } from "@/lib/moderation";
import { submitOmniVoiceJob } from "@/lib/comfyui";
import { newsService } from "@/lib/news";

export interface ConversationTurn {
  userPrompt: string;
  assistantResponse: string;
  createdAt: number;
}

// Global state to survive module re-evaluation
const globalState = globalThis as unknown as {
  liveEngineRunning: boolean;
  liveEngineSegmentCount: number;
  shouldStop: boolean;
  conversationHistory: Map<string, ConversationTurn[]>;
  // Pause-when-nobody's-listening feature (per-client tracking):
  //   playingClients     — Set<clientId> of clients that have reported
  //                         isPlaying === true since last clear. The
  //                         engine runs as long as the set is non-empty
  //                         AND there's at least one WS client. The 5s
  //                         poller clears this set when online===0 (no
  //                         one connected → any "playing" report is
  //                         stale). A single clientId per browser is
  //                         minted in src/app/page.tsx and shared across
  //                         tabs, so multi-tab STOP doesn't trip the
  //                         engine for the wrong listener.
  //   lastKnownOnline    — cache of wsGetStats().online, refreshed by
  //                        the 5s poller. Starts at 0 so a fresh boot
  //                        is "paused until proven otherwise".
  //   onlineStatsInterval — 5s poller handle, on globalThis for HMR.
  playingClients: Set<string>;
  lastKnownOnline: number;
  onlineStatsInterval: ReturnType<typeof setInterval> | null;
  // Generation-surplus accumulator (server-side self-throttle when
  // LLM/TTS is consistently faster than the client can consume):
  //   generationSurplusMs — sum of (L2 − L1) over recent TTS units,
  //                         where L1 is the per-unit TTS submission →
  //                         broadcast latency and L2 is the audio's
  //                         own playback duration (parsed from the
  //                         WAV header). The accumulator grows when
  //                         the server is ahead of playback and is
  //                         reset to 0 after every
  //                         consumeGenerationSurplusPause() that
  //                         actually sleeps. See
  //                         recordGenerationSurplus / consumeGenerationSurplusPause
  //                         below. Stored on globalThis (same pattern
  //                         as the other engine state) so the
  //                         measurement site in src/lib/comfyui can
  //                         update it without importing the engine
  //                         class.
  generationSurplusMs: number;
};
if (globalState.liveEngineRunning === undefined) globalState.liveEngineRunning = false;
if (globalState.liveEngineSegmentCount === undefined) globalState.liveEngineSegmentCount = 0;
if (globalState.shouldStop === undefined) globalState.shouldStop = false;
if (globalState.conversationHistory === undefined) globalState.conversationHistory = new Map();
if (globalState.playingClients === undefined) globalState.playingClients = new Set();
if (globalState.lastKnownOnline === undefined) globalState.lastKnownOnline = 0;
if (globalState.onlineStatsInterval === undefined) globalState.onlineStatsInterval = null;
if (globalState.generationSurplusMs === undefined) globalState.generationSurplusMs = 0;

// Called from src/lib/comfyui's broadcast path once it knows both the
// generation latency (L1) and the audio's own playback duration (L2).
// D = L2 − L1 is the per-unit "surplus": positive when the server
// produced the audio faster than the client will play it (the
// problem case we want to throttle), negative when the server fell
// behind. The accumulator ΣD is what triggers the actual pause. The
// measurement stays in the TTS broadcast path (L1/L2 are TTS-stage
// metrics), but the consumption point has moved upstream: instead of
// sleeping before the next submitOmniVoiceJob, the engine now sleeps
// before pulling the next LLM segment in generateNextSegment().
export function recordGenerationSurplus(L1Ms: number, L2Ms: number): void {
  const d = L2Ms - L1Ms;
  if (!Number.isFinite(d)) return;
  globalState.generationSurplusMs += d;
}

// Called from generateNextSegment() before pulling the next LLM
// segment. If the accumulated surplus exceeds the threshold A, sleep
// (ΣD − A/2) ms and leave A/2 in the accumulator as headroom so the
// next segment doesn't immediately re-trigger.
//
// The headroom matters: per-segment d = L2 − L1 is the TTS-time-saved
// per segment, but the server-side wall-clock per segment is also
// LLM_time + L1 (LLM is invisible to L1 today — see comment on
// recordGenerationSurplus). For server pacing to match client
// consumption, the steady-state sleep per segment must equal d. The
// previous version reset ΣD to 0 after every sleep, which combined
// with the − A/2 offset to make each cycle land at L1 + (d − A/2)
// instead of L1 + d — i.e. the server outpaced the client by A/2 per
// segment forever, growing the client buffer unboundedly. Leaving A/2
// in the accumulator restores exact pacing at any A > 0.
//
// A <= 0 disables the feature entirely — useful for emergency
// "pause-the-throttle" toggles and for the existing tests that
// shouldn't accidentally inject sleeps.
export function consumeGenerationSurplusPause(A: number): Promise<void> {
  if (!A || A <= 0) {
    globalState.generationSurplusMs = 0;
    return Promise.resolve();
  }
  const D = globalState.generationSurplusMs;
  if (D <= A) return Promise.resolve();
  const wait = Math.max(0, D - A / 2);
  console.log(
    `[LiveEngine] generation surplus ${Math.round(D)}ms > threshold ${A}ms, pausing ${Math.round(wait)}ms`,
  );
  // Keep A/2 as headroom for the next segment instead of clearing to
  // 0. The math: a fresh segment adds d to D (going A/2 → A/2 + d),
  // sleep drains it back to A/2. So per-segment sleep converges to d,
  // making the server cycle (L1 + d) equal the client cycle (L2).
  globalState.generationSurplusMs = A / 2;
  return new Promise((r) => setTimeout(r, wait));
}

// Reset hook used by the engine's stop()/flush path and by tests.
export function resetGenerationSurplus(): void {
  globalState.generationSurplusMs = 0;
}

export interface LiveEngineCallbacks {
  onAudioReady?: (audioBuffer: Buffer) => void;
  onMessageApproved?: (message: { id: string; content: string; authorName: string }) => void;
  onSegmentComplete?: (text: string) => void;
}

interface RoundState {
  roundId: number;
  sentences: string[];
  paragraphText: string; // LLM 原始输出整段文本，供 paragraph/group 模式使用
  ttsIndex: number; // current sentence index being processed, -1 if not started
  completed: boolean;
}

class LiveEngine {
  private callbacks: LiveEngineCallbacks = {};
  private pendingMessages: Array<{ id: string; content: string; authorName: string }> = [];
  private clientCallback: (() => void) | null = null;
  private pendingRounds: RoundState[] = [];
  private currentRound: RoundState | null = null;
  private isGeneratingLLM: boolean = false;
  private bufferCfg: AudioBufferConfig = DEFAULT_AUDIO_BUFFER;
  private llmAbortController: AbortController | null = null;

  start(callbacks: LiveEngineCallbacks) {
    this.callbacks = callbacks;
    globalState.liveEngineRunning = true;
    globalState.shouldStop = false;
    // Don't reset clientPlaying/lastKnownOnline here — they belong to
    // the world outside the engine, and overwriting them at start()
    // would let a stale "playing=true" from a previous run keep the
    // engine running before the new client has a chance to report.
    // stop() is the right place to reset.
    this.llmAbortController = new AbortController();
    this.startOnlineStatsPoller();
    // Startup heartbeat: tells ops in the log that the engine booted
    // and which state it landed in. The poller will fill in the real
    // online count on its first tick; for now we report based on
    // whatever the cached state is (always "paused" on a fresh boot
    // because the cache starts at 0).
    console.log(
      `[LiveEngine] started, ${this.pauseCheck() ? "paused" : "running"} ` +
      `(online=${globalState.lastKnownOnline}, playingClients=${globalState.playingClients.size})`,
    );
    this.generateNextSegment();
  }

  stop() {
    globalState.liveEngineRunning = false;
    globalState.shouldStop = true;
    this.llmAbortController?.abort();
    this.llmAbortController = null;
    this.pendingRounds = [];
    this.currentRound = null;
    this.isGeneratingLLM = false;
    // Clear pause-feature state on stop so a subsequent start() begins
    // from a clean "nobody's listening, nobody's playing" baseline.
    // Otherwise stale clientIds in the set would carry over and the
    // new client would have to report playing=true again before
    // generation kicks in.
    globalState.playingClients.clear();
    globalState.lastKnownOnline = 0;
    // Flush just dropped the client buffer; any pending generation
    // surplus is now over-counted. Drop it so a fresh start doesn't
    // immediately pay off a phantom backlog.
    resetGenerationSurplus();
    this.stopOnlineStatsPoller();
    import("@/lib/ws-server").then(m => m.wsFlush()).catch(() => {});
  }

  isRunning(): boolean {
    return globalState.liveEngineRunning;
  }

  // Single source of truth for "should I be generating audio right
  // now?" Returns true (= paused) when:
  //   - an explicit stop was requested, OR
  //   - the engine isn't started at all, OR
  //   - no WS client is currently connected (lastKnownOnline === 0), OR
  //   - no client has reported isPlaying === true (set is empty).
  //
  // Per-client tracking matters: a single global boolean would let
  // one listener's STOP pause the engine for everyone else. The set
  // of currently-playing clientIds is maintained by
  // reportClientPlaying() and cleared by the 5s poller whenever
  // online goes to 0 (the stale-cleanup step).
  //
  // We keep the formula in one method so the three guard sites
  // (processNextUnit / generateNextSegment / line-190 self-perpetuation)
  // can't drift out of sync.
  pauseCheck(): boolean {
    if (globalState.shouldStop) return true;
    if (!globalState.liveEngineRunning) return true;
    return globalState.lastKnownOnline === 0 || globalState.playingClients.size === 0;
  }

  // Called by /api/live/playing whenever the browser flips its
  // isPlaying state. `clientId` is required so we can tell which
  // client is reporting; without it (empty body, legacy client) we
  // ignore the call rather than guess. Adding/removing from the set
  // is the only state mutation — pauseCheck() does the rest.
  reportClientPlaying(playing: boolean, clientId?: string): void {
    if (!clientId) return; // defensive — endpoint also validates
    const wasPaused = this.pauseCheck();
    if (playing) {
      globalState.playingClients.add(clientId);
    } else {
      globalState.playingClients.delete(clientId);
    }
    const isPausedNow = this.pauseCheck();
    const short = clientId.slice(0, 8);
    if (wasPaused && !isPausedNow) {
      console.log(`[LiveEngine] clientId=${short}… playing=true (was paused, resuming)`);
      this.resumeFromPause();
    } else {
      console.log(
        `[LiveEngine] clientId=${short}… playing=${playing} ` +
        `(set size=${globalState.playingClients.size}, no resume trigger)`,
      );
    }
  }

  // Drop any half-baked audio work and kick a fresh segment. Called
  // when the engine transitions from "paused" → "should run". We don't
  // try to splice in the in-flight round because the LLM response
  // text is no longer relevant once we've been sitting paused for
  // seconds-to-minutes — and a new segment is what listeners want
  // when they just arrived.
  private resumeFromPause(): void {
    // Abort any in-flight LLM fetch — the prompt context is stale.
    this.llmAbortController?.abort();
    this.llmAbortController = new AbortController();
    // Drop pending work; the in-flight processNextUnit will return
    // naturally because its top guard now sees pauseCheck()=true.
    this.pendingRounds = [];
    this.currentRound = null;
    this.pendingMessages = [];
    this.isGeneratingLLM = false;
    if (!this.isGeneratingLLM) {
      this.generateNextSegment();
    }
  }

  // 5s poller: keeps globalState.lastKnownOnline in sync with the
  // ws-server's actual client count. Also serves as the wake-up
  // trigger for the "a new listener just connected while we were
  // paused" case — the client may not have hit PLAY yet, but
  // audioClients > 0 means we should start generating.
  //
  // We poll rather than push because (a) the ws-server already has a
  // token-protected HTTP API that returns exactly this number, and
  // (b) it keeps the engine's view consistent with what the admin
  // /visitors page sees — same 5s cadence, same source of truth.
  private startOnlineStatsPoller(): void {
    if (globalState.onlineStatsInterval) return; // already running
    let lastPaused = this.pauseCheck();
    // Steady-state heartbeat: every PAUSED_HEARTBEAT_TICKS polls
    // (~1 minute at 5s/tick) emit a "still paused" log line so ops
    // can see at a glance that the engine is alive but idle. Without
    // this the log is silent during a long idle period, which makes
    // a healthy "no one's listening" state look identical to "the
    // engine crashed". The counter resets on every transition so a
    // fresh "still paused" line appears ~1 minute after a listener
    // disconnects.
    const PAUSED_HEARTBEAT_TICKS = 12;
    let pausedTicks = 0;
    const tick = async () => {
      if (!globalState.liveEngineRunning) return;
      let online = 0;
      try {
        // Lazy import — same pattern comfyui/index.ts uses for
        // wsBroadcast, so we don't introduce a load-order cycle.
        const mod = await import("@/lib/ws-server");
        const stats = await mod.wsGetStats();
        online = stats?.online ?? 0;
      } catch {
        // ws-server may be down; treat as "no listeners" and stay
        // paused. Don't crash the poller — the next tick will retry.
        online = 0;
      }
      globalState.lastKnownOnline = online;
      // Stale cleanup: if no one has a WS connection open, then any
      // "playing" report we received earlier is from a now-gone
      // browser. Drop them from the set so a fresh listener (whose
      // clientId is different) gets a clean start. Run BEFORE
      // pauseCheck() so the transition detector sees the new state.
      if (online === 0 && globalState.playingClients.size > 0) {
        console.log(
          `[LiveEngine] online=0, clearing stale playingClients set ` +
          `(size=${globalState.playingClients.size})`,
        );
        globalState.playingClients.clear();
      }
      const pausedNow = this.pauseCheck();
      if (lastPaused && !pausedNow) {
        console.log(`[LiveEngine] online=${online}, transitioning out of pause, resuming`);
        this.resumeFromPause();
        pausedTicks = 0;
      } else if (pausedNow) {
        pausedTicks++;
        if (pausedTicks === PAUSED_HEARTBEAT_TICKS) {
          console.log(
            `[LiveEngine] still paused (online=${online}, ` +
            `playingClients=${globalState.playingClients.size})`,
          );
          pausedTicks = 0;
        }
      } else {
        // Running. We don't log every tick (would be spammy) — the
        // Submitting TTS unit / First TTS unit logs from the
        // generation loop itself are the running-state heartbeat.
        pausedTicks = 0;
      }
      lastPaused = pausedNow;
    };
    // Fire one immediately so the first pause-check after start() has
    // real data, then every 5s after that.
    void tick();
    globalState.onlineStatsInterval = setInterval(() => { void tick(); }, 5_000);
  }

  private stopOnlineStatsPoller(): void {
    if (globalState.onlineStatsInterval) {
      clearInterval(globalState.onlineStatsInterval);
      globalState.onlineStatsInterval = null;
    }
  }

  onPlaybackComplete(): void {
    // Audio playback complete - not used in new pipeline
  }

  registerPlaybackCallback(cb: () => void): void {
    this.clientCallback = cb;
  }

  async injectMessage(messageId: string) {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (msg && msg.status === "approved") {
      this.pendingMessages.push({ id: msg.id, content: msg.content, authorName: msg.authorName });
    }
  }

  async reviewMessage(messageId: string) {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) return;
    const result = await moderateMessage(msg.content, msg.authorName);
    await prisma.message.update({
      where: { id: messageId },
      data: { status: result.status, reviewedAt: new Date(), aiReason: result.reason },
    });
    if (result.status === "approved") {
      this.pendingMessages.push({ id: msg.id, content: msg.content, authorName: msg.authorName });
      this.callbacks.onMessageApproved?.({ id: msg.id, content: msg.content, authorName: msg.authorName });
    }
  }

  private getThemeHistory(themeId: string): ConversationTurn[] {
    return globalState.conversationHistory.get(themeId) ?? [];
  }

  private appendTurn(themeId: string, turn: ConversationTurn): void {
    const history = this.getThemeHistory(themeId);
    history.push(turn);
    globalState.conversationHistory.set(themeId, history);
  }

  // Start TTS for a round (called when a round is ready to process)
  private async startRoundTTS(round: RoundState) {
    if (this.currentRound || globalState.shouldStop) return;

    this.currentRound = round;
    round.ttsIndex = 0;

    // 重新读取配置，让 admin 改完模式后下一轮生效
    try {
      this.bufferCfg = await getAudioBufferConfig();
    } catch (err) {
      console.error("[LiveEngine] Failed to load audio buffer config, fallback to default:", err);
      this.bufferCfg = DEFAULT_AUDIO_BUFFER;
    }

    console.log(`[LiveEngine] Starting TTS for round ${round.roundId}, ${round.sentences.length} sentences, mode=${this.bufferCfg.prebufferMode}`);
    await this.processNextUnit();
  }

  // Process the next TTS unit (sentence / group of N sentences / whole paragraph) in current round
  private async processNextUnit() {
    if (!this.currentRound || globalState.shouldStop) return;
    // Pause guard: if the engine transitioned into pause state while
    // this recursion was in flight, fall off. The in-flight TTS
    // already-completed unit will have broadcast to zero listeners
    // (no-op); the next recursion (line 194 below) won't happen
    // because we return here. resumeFromPause() clears currentRound
    // so a future generateNextSegment() starts clean.
    if (this.pauseCheck()) return;

    const round = this.currentRound;
    const cfg = this.bufferCfg;

    let unitText: string;
    let advanceBy: number;

    if (cfg.prebufferMode === "paragraph") {
      // 整 round 一次 TTS
      if (round.ttsIndex >= round.sentences.length) {
        this.finalizeRound(round);
        return;
      }
      unitText = round.paragraphText;
      advanceBy = round.sentences.length;
    } else if (cfg.prebufferMode === "group") {
      const groupSize = cfg.prebufferGroupSize ?? 3;
      const slice = round.sentences.slice(round.ttsIndex, round.ttsIndex + groupSize);
      if (slice.length === 0) {
        this.finalizeRound(round);
        return;
      }
      // 用 "。" 拼回，组内保持连贯；末尾不重复加标点
      unitText = slice.join("。");
      advanceBy = slice.length;
    } else {
      // sentences / seconds / both：保持原行为，一句一次 TTS
      if (round.ttsIndex >= round.sentences.length) {
        this.finalizeRound(round);
        return;
      }
      unitText = round.sentences[round.ttsIndex];
      advanceBy = 1;
    }

    const unitNum = Math.floor(round.ttsIndex / Math.max(advanceBy, 1)) + 1;
    const totalUnits = cfg.prebufferMode === "paragraph"
      ? 1
      : cfg.prebufferMode === "group"
        ? Math.ceil(round.sentences.length / (cfg.prebufferGroupSize ?? 3))
        : round.sentences.length;
    console.log(`[LiveEngine] Submitting TTS unit ${unitNum}/${totalUnits} (mode=${cfg.prebufferMode}, size=${advanceBy}) for round ${round.roundId}`);

    try {
      await submitOmniVoiceJob(unitText);
    } catch (err) {
      console.error(`[LiveEngine] TTS error for unit ${unitNum} of round ${round.roundId}:`, err);
    }

    if (globalState.shouldStop) return;

    const completedIndex = round.ttsIndex;
    round.ttsIndex += advanceBy;

    // 第一个 TTS 单元完成时触发下一轮 LLM
    if (completedIndex === 0 && globalState.liveEngineRunning && !globalState.shouldStop && !this.pauseCheck()) {
      console.log(`[LiveEngine] First TTS unit of round ${round.roundId} complete, triggering next LLM`);
      this.generateNextSegment();
    }

    // 处理本轮下一个单元
    await this.processNextUnit();
  }

  // Mark round complete and start next pending round if any
  private finalizeRound(round: RoundState) {
    console.log(`[LiveEngine] Round ${round.roundId} TTS complete`);
    this.currentRound = null;
    round.completed = true;

    const nextRound = this.pendingRounds.shift();
    if (nextRound && globalState.liveEngineRunning && !globalState.shouldStop) {
      this.startRoundTTS(nextRound);
    }
  }

  // Fetch LLM with explicit per-attempt timeout + infinite retry with exponential backoff + jitter
  private async fetchLLMWithRetry(
    apiUrl: string,
    apiKey: string,
    body: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const ATTEMPT_TIMEOUT_MS = 300_000;
    const INITIAL_BACKOFF_MS = 1_000;
    const MAX_BACKOFF_MS = 60_000;

    let attempt = 0;
    let backoff = INITIAL_BACKOFF_MS;

    while (true) {
      attempt++;
      if (signal.aborted) throw new Error("aborted");

      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      signal.addEventListener("abort", onExternalAbort, { once: true });

      const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
      const startedAt = Date.now();
      const sleepMs = Math.min(backoff * (0.5 + Math.random()), MAX_BACKOFF_MS);
      const nextAttemptAt = new Date(Date.now() + sleepMs).toISOString().substring(11, 19);

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        signal.removeEventListener("abort", onExternalAbort);

        if (response.ok) {
          console.log(`[LiveEngine] LLM response received, attempt ${attempt}, took ${Date.now() - startedAt}ms, status ${response.status}`);
          return response;
        }
        console.warn(`[LiveEngine] LLM attempt ${attempt} failed: status ${response.status}, next attempt #${attempt + 1} in ${Math.round(sleepMs)}ms at ${nextAttemptAt} (base ${backoff}ms)`);
      } catch (err) {
        clearTimeout(timer);
        signal.removeEventListener("abort", onExternalAbort);
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[LiveEngine] LLM attempt ${attempt} failed: ${errMsg}, next attempt #${attempt + 1} in ${Math.round(sleepMs)}ms at ${nextAttemptAt} (base ${backoff}ms)`);
      }

      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, sleepMs);
        signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
      });
      if (signal.aborted) throw new Error("aborted");
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }

  // Generate LLM content and add to pending queue
  private async generateNextSegment() {
    if (globalState.shouldStop || !globalState.liveEngineRunning || this.isGeneratingLLM) return;
    // Pause guard: skip the LLM fetch entirely if nobody's listening
    // and no client has reported isPlaying. The chain resumes from
    // resumeFromPause() when the poller detects a transition.
    if (this.pauseCheck()) return;

    this.isGeneratingLLM = true;
    try {
      // Reload audio buffer config so admin changes to pauseThresholdMs
      // take effect on the next segment (same pattern as startRoundTTS).
      // startRoundTTS will reload it again before processNextUnit runs,
      // but we need the current value here for the pause check below.
      let bufferCfg = this.bufferCfg;
      try {
        bufferCfg = await getAudioBufferConfig();
        this.bufferCfg = bufferCfg;
      } catch (err) {
        console.error("[LiveEngine] Failed to load audio buffer config, fallback to default:", err);
        bufferCfg = DEFAULT_AUDIO_BUFFER;
      }

      // Self-throttle before pulling more text from the LLM. If recent
      // TTS units have landed much faster than they play (cumulative
      // ΣD = Σ(L2 − L1) > threshold A), sleep (ΣD − A/2) ms and reset
      // the accumulator. The measurement site (L1/L2) stays in the TTS
      // broadcast path because those are TTS-stage metrics; this is the
      // upstream application point. A<=0 disables the throttle.
      await consumeGenerationSurplusPause(bufferCfg.pauseThresholdMs);

      const theme = await prisma.theme.findFirst({ where: { isActive: true }, include: { persona: true } });
      if (!theme || !globalState.liveEngineRunning) return;

      const config = await getLLMConfig();
      if (!config || !config.apiUrl) {
        console.error("[LiveEngine] LLM config missing or apiUrl empty, skip");
        return;
      }

      const pendingSnapshot = this.pendingMessages.slice();
      this.pendingMessages = [];
      const messageContext = pendingSnapshot.map(m => m.content).join(" | ");
      const authorsContext = pendingSnapshot.map(m => m.authorName).join("、");

      const history = this.getThemeHistory(theme.id);

      let newsContext = "";
      if (pendingSnapshot.length > 0) {
        // C-path: sync search using pending messages as query, overrides A cache
        try {
          newsContext = await newsService.triggerCPathSync(messageContext);
        } catch (err) {
          console.error("[LiveEngine] news C-path failed:", err);
        }
      } else {
        // A-path: per-theme content buffer. theme.id scopes the buffer;
        // theme.description drives the FTS5 query at fill time.
        try {
          newsContext = await newsService.getCurrentNews(theme.id, theme.description);
        } catch (err) {
          console.error("[LiveEngine] news A-path failed:", err);
        }
      }

      const built = buildConversationMessages(theme, messageContext, authorsContext, history, newsContext);

      console.log("[LiveEngine] systemPrompt:", built.systemPrompt);
      console.log("[LiveEngine] currentUserPrompt:", built.currentUserPrompt);
      console.log(
        `[LiveEngine] newsContext: ${newsContext ? `${newsContext.length} chars, preview="${newsContext.substring(0, 80).replace(/\n/g, " ")}..."` : "(empty)"}`,
      );
      console.log(`[LiveEngine] messages count: ${built.messages.length} (system + ${built.messages.length - 2} turns + current user)`);

      globalState.liveEngineSegmentCount++;
      console.log(`[LiveEngine] segment #${globalState.liveEngineSegmentCount}, historyTurns:${history.length}, pendingMessages:${pendingSnapshot.length}`);

      const response = await this.fetchLLMWithRetry(
        config.apiUrl,
        config.apiKey,
        JSON.stringify({
          model: config.modelName,
          messages: built.messages,
          max_completion_tokens: 65536,
          thinking: { type: "disabled" },
        }),
        this.llmAbortController!.signal,
      );

      const data = await response.json().catch((err) => {
        console.error("[LiveEngine] LLM response not JSON, status:", response.status, "url:", config.apiUrl, "err:", err.message);
        return null;
      });
      if (!data) {
        const rawText = await response.text().catch(() => "");
        console.error("[LiveEngine] LLM raw response:", rawText.substring(0, 500));
        return;
      }
      const rawText = data.choices?.[0]?.message?.content ?? "";
      // Strip <think>...</think> blocks. Also handle unclosed <think> (model
      // hit max_tokens mid-thinking): drop everything from <think> to end.
      let text = rawText.replace(/<think>[\s\S]*?<\/think>/g, "");
      const unclosedThink = text.indexOf("<think>");
      if (unclosedThink !== -1) {
        text = text.substring(0, unclosedThink);
      }
      text = text.trim();
      console.log("[LiveEngine] LLM response:", text);

      if (!text) {
        const finishReason = data.choices?.[0]?.finish_reason ?? data.choices?.[0]?.stop_reason ?? "unknown";
        const usage = data.usage ? JSON.stringify(data.usage) : "(no usage)";
        const reasoning = data.choices?.[0]?.message?.reasoning_content;
        console.error(
          "[LiveEngine] LLM produced empty content. " +
            `finish_reason=${finishReason}, usage=${usage}, ` +
            `rawText.length=${rawText.length}, ` +
            `has_reasoning_content=${reasoning ? `yes (${reasoning.length} chars)` : "no"}, ` +
            `choices.length=${data.choices?.length ?? 0}`,
        );
        if (rawText.length > 0) {
          console.error("[LiveEngine] rawText (pre-strip, first 500):", rawText.substring(0, 500));
        }
        if (reasoning) {
          console.error("[LiveEngine] reasoning_content (first 300):", String(reasoning).substring(0, 300));
        }
        if (!data.choices || data.choices.length === 0) {
          console.error("[LiveEngine] LLM raw data:", JSON.stringify(data).substring(0, 800));
        }
      }

      if (text && globalState.liveEngineRunning && !globalState.shouldStop) {
        const PUNCTUATION = /[。？！.!?]/;
        const sentences = text.split(PUNCTUATION).map((s: string) => s.trim()).filter(Boolean);
        console.log(`[LiveEngine] Generated ${sentences.length} sentences for round ${globalState.liveEngineSegmentCount}`);

        if (sentences.length > 0) {
          const round: RoundState = {
            roundId: globalState.liveEngineSegmentCount,
            sentences,
            paragraphText: text,
            ttsIndex: -1,
            completed: false,
          };

          // If no current round, start this one; otherwise add to pending
          if (!this.currentRound && globalState.liveEngineRunning && !globalState.shouldStop) {
            this.startRoundTTS(round);
          } else {
            this.pendingRounds.push(round);
            console.log(`[LiveEngine] Round ${round.roundId} queued, pending: ${this.pendingRounds.length}`);
          }
        }

        // Append to in-memory history for next turn's multi-turn context
        this.appendTurn(theme.id, {
          userPrompt: built.currentUserPrompt,
          assistantResponse: text,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      if (err instanceof Error && err.message === "aborted") {
        console.log("[LiveEngine] LLM fetch aborted (engine stopped)");
      } else {
        console.error("[LiveEngine] Generation failed:", err);
      }
    } finally {
      this.isGeneratingLLM = false;
    }
  }
}

export const liveEngine = new LiveEngine();

// Pure helper exported for testing. Builds the LLM messages array given a theme,
// the current pending listener message context string, and the in-memory history.
export interface BuildMessagesInput {
  id: string;
  name: string;
  description: string;
  prompt: string;
  userPrompt: string;
  audiencePrompt: string;
  historyRounds: number;
  persona: { name: string; personality: string };
}

export interface BuildMessagesResult {
  systemPrompt: string;
  currentUserPrompt: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

export function buildConversationMessages(
  theme: BuildMessagesInput,
  messageContext: string,
  authorsContext: string,
  history: ConversationTurn[],
  newsContext: string = "",
): BuildMessagesResult {
  const substitute = (s: string): string =>
    s
      .replace(/\{\{name\}\}/g, theme.persona.name)
      .replace(/\{\{personality\}\}/g, theme.persona.personality)
      .replace(/\{\{theme\.name\}\}/g, theme.name)
      .replace(/\{\{theme\.description\}\}/g, theme.description)
      .replace(/\{\{listenerMessages\}\}/g, messageContext)
      .replace(/\{\{listenerAuthors\}\}/g, authorsContext)
      .replace(/\{\{news\}\}/g, newsContext);

  const systemPrompt = theme.prompt
    ? substitute(theme.prompt)
    : `你是${theme.persona.name}，一个${theme.persona.personality}。当前直播主题：${theme.name}。${theme.description}。请根据以上信息自主发挥，生成一段直播内容（约100-200字）。`;

  const promptTemplate = (messageContext.length > 0 ? theme.audiencePrompt : "") || theme.userPrompt || "请生成下一段直播内容。";
  const currentUserPrompt = substitute(promptTemplate);

  const rounds = theme.historyRounds;
  let sliced: ConversationTurn[];
  if (rounds === -1) {
    sliced = history;
  } else if (rounds < 0) {
    sliced = []; // treat unknown negative as 0 (no history)
  } else {
    sliced = history.slice(-rounds);
  }

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const turn of sliced) {
    messages.push({ role: "user", content: turn.userPrompt });
    messages.push({ role: "assistant", content: turn.assistantResponse });
  }
  messages.push({ role: "user", content: currentUserPrompt });

  return { systemPrompt, currentUserPrompt, messages };
}

// Test-only helpers to inspect and mutate the in-memory conversation history
// (kept separate from the LiveEngine public API).
export function _testGetHistory(themeId: string): ConversationTurn[] {
  return globalState.conversationHistory.get(themeId) ?? [];
}

export function _testAppendTurn(themeId: string, turn: ConversationTurn): void {
  const history = globalState.conversationHistory.get(themeId) ?? [];
  history.push(turn);
  globalState.conversationHistory.set(themeId, history);
}

export function _testClearHistory(themeId?: string): void {
  if (themeId === undefined) {
    globalState.conversationHistory.clear();
  } else {
    globalState.conversationHistory.delete(themeId);
  }
}