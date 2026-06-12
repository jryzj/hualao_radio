// Tests for the "pause audio generation when nobody is listening"
// feature, now using per-client tracking. The engine consults a
// single pauseCheck() predicate
//   running ∧ online>0 ∧ playingClients.size>0
// at three call sites; this suite exercises that predicate directly
// and the public reportClientPlaying() / start() / stop() lifecycle
// that drives it.
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
  getAudioBufferConfigMock: vi.fn(async () => ({ prebufferMode: "sentences", prebufferSentences: 3, prebufferGroupSize: 3, prebufferSeconds: 0, maxBufferSentences: 5 })),
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
  DEFAULT_AUDIO_BUFFER: { prebufferMode: "sentences", prebufferSentences: 3, prebufferGroupSize: 3, prebufferSeconds: 0, maxBufferSentences: 5 },
}));

vi.mock("../lib/news", () => ({
  newsService: newsServiceMock,
}));

vi.mock("../lib/moderation", () => ({
  moderateMessage: vi.fn(async () => ({ status: "approved", reason: "" })),
}));

import { liveEngine } from "../lib/live-engine/index";

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
  // Reset all mocks so call counts don't leak between tests.
  submitOmniVoiceJobSpy.mockClear();
  wsGetStatsMock.mockClear();
  wsFlushMock.mockClear();
  prismaMock.theme.findFirst.mockClear();
  prismaMock.theme.findFirst.mockResolvedValue(null);
  getLLMConfigMock.mockClear();
  getLLMConfigMock.mockResolvedValue(null);
  getAudioBufferConfigMock.mockClear();
  getAudioBufferConfigMock.mockResolvedValue({ prebufferMode: "sentences", prebufferSentences: 3, prebufferGroupSize: 3, prebufferSeconds: 0, maxBufferSentences: 5 });
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
});
