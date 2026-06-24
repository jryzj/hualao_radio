// Tests for the "pause audio generation when nobody is listening"
// feature, now using per-client tracking. The engine consults a
// single pauseCheck() predicate
//   running ∧ online>0 ∧ playingClients.size>0
// at three call sites; this suite exercises that predicate directly
// and the public reportClientPlaying() / start() / stop() lifecycle
// that drives it.
//
// Also covers the "self-throttle when generation outpaces the
// client" feature: Σ(L2 − L1) > pauseThresholdMs triggers a sleep
// of (ΣD − A/2) ms before pulling the next LLM segment — the
// upstream application point. The accumulator lives on globalThis
// (same pattern as the rest of the engine's module-scoped state)
// and is consumed at the start of generateNextSegment. See
// src/lib/live-engine/index.ts:consumeGenerationSurplusPause.
//
// Per-client tracking (vs a single global boolean) matters because
// a single-flag design would let one listener's STOP pause the
// engine for everyone else. The set of currently-playing clientIds
// is the source of truth; the 5s poller clears it when online=0
// (stale-cleanup step).
//
// We mock the heavy external dependencies (LLM config fetch, theme
// DB query, news service, ComfyUI submission, ws-server stats) so
// the tests don't actually need any of those services to be running.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// vi.mock is hoisted to the top of the file by vitest, so the
// factory body must not reference variables defined later. We use
// vi.hoisted to create the spies once and let the factory return
// references to them.
const { submitOmniVoiceJobSpy, wsGetStatsMock, wsFlushMock, prismaMock, getLLMConfigMock, getAudioBufferConfigMock, newsServiceMock } = vi.hoisted(() => ({
  submitOmniVoiceJobSpy: vi.fn(async () => "mock-prompt-id"),
  wsGetStatsMock: vi.fn(async () => ({ audioClients: 0, messageClients: 0, online: 0 })),
  wsFlushMock: vi.fn(async () => {}),
  prismaMock: {
    theme: { findFirst: vi.fn(async () => null) },
    message: { findUnique: vi.fn(async () => null), update: vi.fn(async () => null) },
  },
  getLLMConfigMock: vi.fn(async () => null),
  getAudioBufferConfigMock: vi.fn(async () => ({ prebufferMode: "sentences", prebufferSentences: 3, prebufferGroupSize: 3, prebufferSeconds: 0, pauseThresholdMs: 60_000 })),
  newsServiceMock: {
    triggerCPathSync: vi.fn(async () => ""),
    getCurrentNews: vi.fn(async () => ""),
  },
}));

vi.mock("../lib/comfyui", () => ({
  submitOmniVoiceJob: submitOmniVoiceJobSpy,
}));

vi.mock("../lib/ws-server", () => ({
  wsGetStats: wsGetStatsMock,
  wsFlush: wsFlushMock,
  wsBroadcast: vi.fn(),
  wsBroadcastMessage: vi.fn(),
}));

vi.mock("../lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../config", () => ({
  getLLMConfig: getLLMConfigMock,
  getAudioBufferConfig: getAudioBufferConfigMock,
  DEFAULT_AUDIO_BUFFER: { prebufferMode: "sentences", prebufferSentences: 3, prebufferGroupSize: 3, prebufferSeconds: 0, pauseThresholdMs: 60_000 },
}));

vi.mock("../lib/news", () => ({
  newsService: newsServiceMock,
}));

vi.mock("../lib/moderation", () => ({
  moderateMessage: vi.fn(async () => ({ status: "approved", reason: "" })),
}));

import { liveEngine } from "../lib/live-engine/index";
import {
  recordGenerationSurplus,
  consumeGenerationSurplusPause,
  resetGenerationSurplus,
} from "../lib/live-engine/index";

// Access the engine's private globalThis-backing state for assertions
// in tests that need to inspect it. The fields we touch here are
// stable — they live in the same globalThis cache the engine uses.
function getEngineState() {
  return globalThis as unknown as {
    liveEngineRunning: boolean;
    shouldStop: boolean;
    playingClients: Set<string>;
    lastKnownOnline: number;
    onlineStatsInterval: ReturnType<typeof setInterval> | null;
    generationSurplusMs: number;
  };
}

beforeEach(() => {
  // Reset the engine to a known idle state. We have to do this
  // through the public API (stop()) because the globalThis cache
  // is private to the module.
  liveEngine.stop();
  // Reset the state fields the feature added, in case a previous
  // test left residue. liveEngine.stop() should have already done
  // most of this, but be explicit.
  const s = getEngineState();
  s.playingClients = new Set();
  s.lastKnownOnline = 0;
  if (s.onlineStatsInterval) {
    clearInterval(s.onlineStatsInterval);
    s.onlineStatsInterval = null;
  }
  s.generationSurplusMs = 0;
  // Reset all mocks so call counts don't leak between tests.
  submitOmniVoiceJobSpy.mockClear();
  wsGetStatsMock.mockClear();
  wsFlushMock.mockClear();
  prismaMock.theme.findFirst.mockClear();
  prismaMock.theme.findFirst.mockResolvedValue(null);
  getLLMConfigMock.mockClear();
  getLLMConfigMock.mockResolvedValue(null);
  getAudioBufferConfigMock.mockClear();
  getAudioBufferConfigMock.mockResolvedValue({ prebufferMode: "sentences", prebufferSentences: 3, prebufferGroupSize: 3, prebufferSeconds: 0, pauseThresholdMs: 60_000 });
  newsServiceMock.getCurrentNews.mockClear();
  newsServiceMock.triggerCPathSync.mockClear();
  newsServiceMock.getCurrentNews.mockResolvedValue("");
});

afterEach(() => {
  // Defensive: make sure no interval leaks even if a test forgot to
  // call stop().
  liveEngine.stop();
});

describe("pauseCheck() predicate", () => {
  it("returns true when engine is not running", () => {
    const s = getEngineState();
    s.liveEngineRunning = false;
    s.shouldStop = false;
    s.playingClients.add("A");
    s.lastKnownOnline = 5;
    expect(liveEngine.pauseCheck()).toBe(true);
  });

  it("returns true when shouldStop is set, even with listeners and clients playing", () => {
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = true;
    s.playingClients.add("A");
    s.lastKnownOnline = 5;
    expect(liveEngine.pauseCheck()).toBe(true);
  });

  it("returns true when no listeners AND no clients playing", () => {
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = false;
    // playingClients is empty
    s.lastKnownOnline = 0;
    expect(liveEngine.pauseCheck()).toBe(true);
  });

  it("returns true when a WS client is online but playingClients is empty (STOP pressed)", () => {
    // Critical case: WS still open (tab not closed), but the user
    // hit STOP. The engine MUST pause here, because nobody in the
    // set means no one is currently playing.
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = false;
    s.lastKnownOnline = 1;
    expect(liveEngine.pauseCheck()).toBe(true);
  });

  it("returns true when playingClients is stale (browser closed without reporting false)", () => {
    // online went to 0 after the tab closed; playingClients still
    // has the now-stale id. The online=0 branch pauses regardless
    // of stale entries. (In production, the 5s poller clears the
    // set on the next tick; this test exercises the predicate
    // directly.)
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = false;
    s.playingClients.add("A"); // stale
    s.lastKnownOnline = 0;
    expect(liveEngine.pauseCheck()).toBe(true);
  });

  it("returns false only when online > 0 AND playingClients is non-empty", () => {
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = false;
    s.playingClients.add("A");
    s.lastKnownOnline = 1;
    expect(liveEngine.pauseCheck()).toBe(false);
  });
});

describe("reportClientPlaying(playing, clientId) per-client tracking", () => {
  it("ignores calls with empty/missing clientId (defensive)", () => {
    // The engine's `if (!clientId) return;` rejects undefined and
    // empty string. Whitespace-only ids pass through (the endpoint
    // is the gatekeeper for richer validation; the engine just
    // trusts what it gets).
    liveEngine.reportClientPlaying(true); // no clientId
    liveEngine.reportClientPlaying(true, "");
    expect(getEngineState().playingClients.size).toBe(0);
  });

  it("adds and removes a single clientId from the set", () => {
    liveEngine.reportClientPlaying(true, "client-A");
    expect(getEngineState().playingClients.has("client-A")).toBe(true);
    liveEngine.reportClientPlaying(false, "client-A");
    expect(getEngineState().playingClients.has("client-A")).toBe(false);
  });

  it("CRITICAL: A stops while B is still playing → engine keeps running", () => {
    // The whole point of the per-client rewrite. A single-flag
    // design would have flipped to !playing and paused the engine
    // for B. With per-client tracking, removing A from the set
    // leaves B's entry, so playingClients.size stays > 0.
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = false;
    s.lastKnownOnline = 2; // two listeners connected
    liveEngine.reportClientPlaying(true, "A");
    liveEngine.reportClientPlaying(true, "B");
    expect(s.playingClients.size).toBe(2);
    expect(liveEngine.pauseCheck()).toBe(false);

    liveEngine.reportClientPlaying(false, "A");
    expect(s.playingClients.size).toBe(1);
    expect(s.playingClients.has("B")).toBe(true);
    expect(liveEngine.pauseCheck()).toBe(false); // B is still playing

    liveEngine.reportClientPlaying(false, "B");
    expect(s.playingClients.size).toBe(0);
    expect(liveEngine.pauseCheck()).toBe(true); // now paused
  });
});

describe("Bug #1 contract: client segment-end does not pause the engine", () => {
  // Regression guard for the fix in src/app/page.tsx — onAudioEnded
  // no longer POSTs playing=false on segment-to-segment transitions.
  //
  // The contract this pins: the page only reports playing=false on
  // real stop signals (STOP button, pagehide, audio.onpause after
  // 500ms debounce). Segment-to-segment transitions in continuous
  // playback never empty the playingClients set; a fresh
  // playing=true report from the same client restores the running
  // state immediately. The engine itself is the source of truth for
  // "the user stopped" — if the WS force-reconnect on visibility
  // fires after a Doze-induced drop, the new connection will
  // re-report playing=true, and the engine should resume.
  //
  // Without this contract, the original bug (HTML audio path runs
  // segments back-to-back via playNext() and never re-POSTs
  // playing=true) would empty playingClients between every segment,
  // flip pauseCheck() to true, and the engine would pause
  // permanently after the first segment.
  it("playing=false → playing=true on the same client restores running state in one tick", () => {
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = false;
    s.lastKnownOnline = 1;
    liveEngine.reportClientPlaying(true, "A");
    expect(liveEngine.pauseCheck()).toBe(false);

    // Client signals a momentary gap (e.g. between HTML segments,
    // or a transient buffer stall — engine SHOULD treat this as
    // "still playing" if a playing=true arrives shortly after).
    liveEngine.reportClientPlaying(false, "A");
    expect(liveEngine.pauseCheck()).toBe(true);

    // The next segment starts; the client re-reports playing=true.
    // The set is repopulated and the engine resumes — without any
    // need for the user to toggle PLAY manually.
    liveEngine.reportClientPlaying(true, "A");
    expect(liveEngine.pauseCheck()).toBe(false);
  });

  it("a second client's playing=true keeps the engine running through another client's gap", () => {
    // Belt-and-suspenders: the per-client design already handles
    // this (covered by the "CRITICAL: A stops while B is still
    // playing" test above), but pin it under the Bug #1 framing
    // because the original onAudioEnded bug also didn't account
    // for multi-tab / multi-client scenarios.
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = false;
    s.lastKnownOnline = 2;
    liveEngine.reportClientPlaying(true, "A");
    liveEngine.reportClientPlaying(true, "B");
    liveEngine.reportClientPlaying(false, "A"); // A's segment gap
    expect(liveEngine.pauseCheck()).toBe(false); // B still playing
    liveEngine.reportClientPlaying(true, "A"); // A's next segment
    liveEngine.reportClientPlaying(false, "B"); // B's segment gap
    expect(liveEngine.pauseCheck()).toBe(false); // A still playing
  });
});

describe("start() with paused initial state", () => {
  it("does not call submitOmniVoiceJob when paused (no listeners, no clients playing)", async () => {
    wsGetStatsMock.mockResolvedValue({ audioClients: 0, messageClients: 0, online: 0 });
    liveEngine.start({});
    // Give the engine enough time to do an LLM fetch (which will
    // early-out because prisma.theme.findFirst returns null) and
    // potentially kick a TTS round. The pause guard at
    // generateNextSegment() top should prevent it from ever
    // reaching processNextUnit → submitOmniVoiceJob.
    await new Promise(r => setTimeout(r, 50));
    expect(submitOmniVoiceJobSpy).not.toHaveBeenCalled();
    expect(liveEngine.isRunning()).toBe(true);
  });
});

describe("startOnlineStatsPoller lifecycle", () => {
  it("starts the 5s poller on start() and clears it on stop()", () => {
    liveEngine.start({});
    expect(getEngineState().onlineStatsInterval).not.toBeNull();
    liveEngine.stop();
    expect(getEngineState().onlineStatsInterval).toBeNull();
  });

  it("is idempotent: a second start() does not stack intervals", () => {
    liveEngine.start({});
    const first = getEngineState().onlineStatsInterval;
    liveEngine.start({});
    const second = getEngineState().onlineStatsInterval;
    expect(first).toBe(second);
    liveEngine.stop();
  });
});

describe("stop() resets pause-feature state", () => {
  it("clears playingClients and lastKnownOnline on stop", () => {
    liveEngine.start({});
    liveEngine.reportClientPlaying(true, "A");
    liveEngine.reportClientPlaying(true, "B");
    expect(getEngineState().playingClients.size).toBe(2);
    liveEngine.stop();
    expect(getEngineState().playingClients.size).toBe(0);
    expect(getEngineState().lastKnownOnline).toBe(0);
  });

  it("resets the generation-surplus accumulator on stop", () => {
    // After a flush, any pending surplus is over-counted: the client
    // just dropped everything it had buffered. Drop the accumulator
    // so the next start() doesn't pay off a phantom backlog.
    getEngineState().generationSurplusMs = 123_456;
    liveEngine.stop();
    expect(getEngineState().generationSurplusMs).toBe(0);
  });
});

describe("generation surplus accumulator", () => {
  // Helpers — keep tests below readable.
  const surplus = () => getEngineState().generationSurplusMs;

  beforeEach(() => {
    resetGenerationSurplus();
  });

  it("recordGenerationSurplus adds (L2 − L1) to the accumulator", () => {
    // Fast generation: L1=2s, L2=5s → D=+3s (positive surplus)
    recordGenerationSurplus(2000, 5000);
    expect(surplus()).toBe(3000);
    recordGenerationSurplus(2000, 5000);
    expect(surplus()).toBe(6000);
  });

  it("accepts negative per-unit D (slow generation) and the accumulator goes negative", () => {
    // Slow generation: L1=8s, L2=5s → D=−3s. This represents the
    // engine falling behind, which we don't act on but we do track.
    recordGenerationSurplus(8000, 5000);
    expect(surplus()).toBe(-3000);
  });

  it("ignores non-finite inputs (defensive)", () => {
    recordGenerationSurplus(NaN, 5000);
    recordGenerationSurplus(2000, Infinity);
    expect(surplus()).toBe(0);
  });
});

describe("consumeGenerationSurplusPause", () => {
  beforeEach(() => {
    resetGenerationSurplus();
  });

  it("does not sleep when ΣD is below the threshold", async () => {
    recordGenerationSurplus(2000, 5000); // +3s
    recordGenerationSurplus(2000, 5000); // +6s total
    const A = 60_000;
    const t0 = Date.now();
    await consumeGenerationSurplusPause(A);
    expect(Date.now() - t0).toBeLessThan(50); // effectively instant
    // ΣD is preserved when below the threshold (we don't touch it).
    expect(getEngineState().generationSurplusMs).toBe(6000);
  });

  it("sleeps (ΣD − A/2) ms and resets when ΣD exceeds A", async () => {
    // Build ΣD = 90s, A = 60s. Expected sleep ≈ 60s (90 − 30).
    // For the test, scale it down so the wall-clock wait is short:
    // ΣD = 9000, A = 6000 → sleep ≈ 6000ms.
    for (let i = 0; i < 9; i++) {
      recordGenerationSurplus(0, 1000); // +1s each
    }
    expect(getEngineState().generationSurplusMs).toBe(9000);
    const A = 6000;
    const expectedSleep = 9000 - A / 2; // 6000
    const t0 = Date.now();
    await consumeGenerationSurplusPause(A);
    const elapsed = Date.now() - t0;
    // Allow generous slack for CI scheduling jitter (timer resolution
    // on Windows is ~15ms, plus a 250ms margin is plenty).
    expect(elapsed).toBeGreaterThanOrEqual(expectedSleep - 50);
    expect(elapsed).toBeLessThan(expectedSleep + 500);
    // Accumulator is reset after the sleep.
    expect(getEngineState().generationSurplusMs).toBe(0);
  });

  it("returns instantly and resets when A is 0 (feature disabled)", async () => {
    getEngineState().generationSurplusMs = 999_999;
    const t0 = Date.now();
    await consumeGenerationSurplusPause(0);
    expect(Date.now() - t0).toBeLessThan(20);
    expect(getEngineState().generationSurplusMs).toBe(0);
  });

  it("returns instantly and resets when A is negative", async () => {
    getEngineState().generationSurplusMs = 999_999;
    const t0 = Date.now();
    await consumeGenerationSurplusPause(-1000);
    expect(Date.now() - t0).toBeLessThan(20);
    expect(getEngineState().generationSurplusMs).toBe(0);
  });

  it("does not sleep when ΣD equals A exactly (strict >)", async () => {
    for (let i = 0; i < 6; i++) {
      recordGenerationSurplus(0, 1000); // ΣD = 6000
    }
    const t0 = Date.now();
    await consumeGenerationSurplusPause(6000); // ΣD === A, not > A
    expect(Date.now() - t0).toBeLessThan(20);
    // ΣD is preserved at the boundary (it didn't get drained).
    expect(getEngineState().generationSurplusMs).toBe(6000);
  });
});

describe("WAV-surplus wiring (recordGenerationSurplus on a parsed buffer)", () => {
  // This is the end-to-end test of the comfyui → live-engine path:
  // parse a real PCM WAV header, then feed the resulting (L1, L2)
  // into recordGenerationSurplus. We use the real parseWavDurationMs
  // (not mocked) so a regression in either piece surfaces here.
  it("a 1-second WAV with L1=200ms accumulates +800ms of surplus", async () => {
    const { parseWavDurationMs } = await import("../lib/audio/wav-duration");
    // 1 second, 16-bit mono 44.1kHz PCM = 88200 bytes of data.
    const header = Buffer.alloc(12 + 8 + 16 + 8);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + 88200, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // numChannels
    header.writeUInt32LE(44_100, 24); // sampleRate
    header.writeUInt32LE(44_100 * 2, 28); // byteRate
    header.writeUInt16LE(2, 32); // blockAlign
    header.writeUInt16LE(16, 34); // bitsPerSample
    header.write("data", 36);
    header.writeUInt32LE(88200, 40);

    const L2 = parseWavDurationMs(header);
    expect(L2).not.toBeNull();
    expect(L2!).toBeCloseTo(1000, 1);
    recordGenerationSurplus(200, L2!);
    expect(getEngineState().generationSurplusMs).toBeCloseTo(800, 1);
  });
});

describe("self-throttle application point (LLM, not TTS)", () => {
  // The migration moved consumeGenerationSurplusPause() from
  // processNextUnit() to generateNextSegment(). This suite locks that
  // in: the accumulator must be drained by the LLM-stage call (no
  // TTS work needed), and a TTS-only flow (no LLM call) must not
  // touch the accumulator on its own.
  beforeEach(() => {
    resetGenerationSurplus();
  });

  it("generateNextSegment consumes ΣD when starting an LLM segment, with no TTS work involved", async () => {
    const s = getEngineState();
    s.liveEngineRunning = true;
    s.shouldStop = false;
    // Engine must NOT be in a pause state, otherwise generateNextSegment
    // early-returns at the pauseCheck() guard before reaching the
    // surplus pause.
    s.playingClients.add("client-A");
    s.lastKnownOnline = 1;
    // Prevent the 5s poller from clobbering our state during the
    // ~1.5s sleep window — it can fire between start() and the wait.
    if (s.onlineStatsInterval) {
      clearInterval(s.onlineStatsInterval);
      s.onlineStatsInterval = null;
    }

    // Tight threshold so the test stays fast: ΣD = 1500ms > A = 200ms
    // → expected sleep ≈ 1400ms (ΣD − A/2). Round up the wait to 1700ms
    // for CI jitter on Windows (timer resolution ~15ms).
    const A = 200;
    getAudioBufferConfigMock.mockResolvedValue({
      prebufferMode: "sentences",
      prebufferSentences: 3,
      prebufferGroupSize: 3,
      prebufferSeconds: 0,
      pauseThresholdMs: A,
    });

    // ΣD = 1500ms (3 × +500)
    recordGenerationSurplus(0, 500);
    recordGenerationSurplus(0, 500);
    recordGenerationSurplus(0, 500);
    expect(getEngineState().generationSurplusMs).toBe(1500);

    // theme returns null so generateNextSegment bails AFTER the
    // surplus pause, BEFORE startRoundTTS / processNextUnit /
    // submitOmniVoiceJob are ever reached. This isolates the LLM-stage
    // call: if the throttle were still wired into processNextUnit, the
    // accumulator would survive untouched here.
    prismaMock.theme.findFirst.mockResolvedValue(null);

    liveEngine.start({});

    // Wait long enough for the ~1400ms sleep + post-pause theme fetch.
    await new Promise((r) => setTimeout(r, 1700));

    // The accumulator was drained — proves consumeGenerationSurplusPause
    // ran on this code path.
    expect(getEngineState().generationSurplusMs).toBe(0);
    // And TTS was never invoked — proves the drain happened at the LLM
    // stage (theme returned null, so no round was created).
    expect(submitOmniVoiceJobSpy).not.toHaveBeenCalled();
    // Theme was fetched — proves generateNextSegment ran past the pause.
    expect(prismaMock.theme.findFirst).toHaveBeenCalled();
  });
});
