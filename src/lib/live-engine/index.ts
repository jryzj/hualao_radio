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
};
if (globalState.liveEngineRunning === undefined) globalState.liveEngineRunning = false;
if (globalState.liveEngineSegmentCount === undefined) globalState.liveEngineSegmentCount = 0;
if (globalState.shouldStop === undefined) globalState.shouldStop = false;
if (globalState.conversationHistory === undefined) globalState.conversationHistory = new Map();

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
    this.llmAbortController = new AbortController();
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
    import("@/lib/ws-server").then(m => m.wsFlush()).catch(() => {});
  }

  isRunning(): boolean {
    return globalState.liveEngineRunning;
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
    if (completedIndex === 0 && globalState.liveEngineRunning && !globalState.shouldStop) {
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

    this.isGeneratingLLM = true;
    try {
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
        // A-path: pick 3 random RSS items fresh per call
        try {
          newsContext = await newsService.getCurrentNews();
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
  persona: { name: string; prompt: string };
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
      .replace(/\{\{prompt\}\}/g, theme.persona.prompt)
      .replace(/\{\{theme\.name\}\}/g, theme.name)
      .replace(/\{\{theme\.description\}\}/g, theme.description)
      .replace(/\{\{listenerMessages\}\}/g, messageContext)
      .replace(/\{\{listenerAuthors\}\}/g, authorsContext)
      .replace(/\{\{news\}\}/g, newsContext);

  const systemPrompt = theme.prompt
    ? substitute(theme.prompt)
    : `你是${theme.persona.name}，一个${theme.persona.prompt}。当前直播主题：${theme.name}。${theme.description}。请根据以上信息自主发挥，生成一段直播内容（约100-200字）。`;

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