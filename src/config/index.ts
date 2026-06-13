import { prisma } from "@/lib/prisma";

export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  modelName: string;
}

export interface ComfyUIConfig {
  serverUrl: string;
  comfyuiToken: string;
  webhookUrl: string;
  pollTimeoutMs?: number;
}

export async function getLLMConfig(): Promise<LLMConfig | null> {
  const config = await prisma.lLMConfig.findFirst();
  if (!config) return null;
  return { apiUrl: config.apiUrl, apiKey: config.apiKey, modelName: config.modelName };
}

export async function setLLMConfig(cfg: LLMConfig): Promise<void> {
  await prisma.lLMConfig.deleteMany();
  await prisma.lLMConfig.create({ data: { ...cfg } });
}

export async function getComfyUIConfig(): Promise<ComfyUIConfig | null> {
  const config = await prisma.comfyUIConfig.findFirst();
  if (!config) return null;
  return { serverUrl: config.serverUrl, comfyuiToken: config.comfyuiToken, webhookUrl: config.webhookUrl, pollTimeoutMs: config.pollTimeoutMs };
}

export async function setComfyUIConfig(cfg: ComfyUIConfig): Promise<void> {
  await prisma.comfyUIConfig.deleteMany();
  await prisma.comfyUIConfig.create({
    data: {
      serverUrl: cfg.serverUrl,
      comfyuiToken: cfg.comfyuiToken ?? "",
      webhookUrl: cfg.webhookUrl,
      pollTimeoutMs: cfg.pollTimeoutMs ?? 120000,
    },
  });
}

export async function getModerationPrompt(): Promise<string | null> {
  const prompt = await prisma.moderationPrompt.findFirst();
  return prompt?.prompt ?? null;
}

export async function setModerationPrompt(prompt: string): Promise<void> {
  await prisma.moderationPrompt.deleteMany();
  await prisma.moderationPrompt.create({ data: { prompt } });
}

export interface AudioBufferConfig {
  prebufferSentences: number;
  prebufferSeconds: number;
  prebufferMode: "sentences" | "seconds" | "both" | "group" | "paragraph";
  prebufferGroupSize: number;
}

export const DEFAULT_AUDIO_BUFFER: AudioBufferConfig = {
  prebufferSentences: 3,
  prebufferSeconds: 8,
  prebufferMode: "sentences",
  prebufferGroupSize: 3,
};

export async function getAudioBufferConfig(): Promise<AudioBufferConfig> {
  const cfg = await prisma.audioBufferConfig.findFirst();
  if (!cfg) return DEFAULT_AUDIO_BUFFER;
  return {
    prebufferSentences: cfg.prebufferSentences,
    prebufferSeconds: cfg.prebufferSeconds,
    prebufferMode: (cfg.prebufferMode as AudioBufferConfig["prebufferMode"]) ?? "sentences",
    prebufferGroupSize: cfg.prebufferGroupSize ?? 3,
  };
}

export async function setAudioBufferConfig(cfg: AudioBufferConfig): Promise<void> {
  await prisma.audioBufferConfig.deleteMany();
  await prisma.audioBufferConfig.create({
    data: {
      prebufferSentences: cfg.prebufferSentences,
      prebufferSeconds: cfg.prebufferSeconds,
      prebufferMode: cfg.prebufferMode,
      prebufferGroupSize: cfg.prebufferGroupSize ?? 3,
    },
  });
}

export interface NewsConfig {
  prefetchIntervalMs: number;
  updateIntervalMs: number;
  activeWindowMs: number;
  retentionDays: number;
  maxConcurrentFetches: number;
  maxNewsItems: number;
  maxItemChars: number;
  maxTotalChars: number;
  tavilyApiKey: string;
  tavilyTimeRange: "d" | "w" | "m" | "y";
  decisionModelName: string;
  newsPoolSize: number;
}

export const DEFAULT_NEWS_CONFIG: NewsConfig = {
  prefetchIntervalMs: 300_000,
  updateIntervalMs: 14_400_000,
  activeWindowMs: 86_400_000,
  retentionDays: 7,
  maxConcurrentFetches: 5,
  maxNewsItems: 3,
  maxItemChars: 2000,
  maxTotalChars: 5000,
  tavilyApiKey: "",
  tavilyTimeRange: "d",
  decisionModelName: "",
  newsPoolSize: 100,
};

export async function getNewsConfig(): Promise<NewsConfig> {
  const cfg = await prisma.newsConfig.findFirst();
  if (!cfg) return DEFAULT_NEWS_CONFIG;
  return {
    prefetchIntervalMs: cfg.prefetchIntervalMs,
    updateIntervalMs: cfg.updateIntervalMs,
    activeWindowMs: cfg.activeWindowMs,
    retentionDays: cfg.retentionDays,
    maxConcurrentFetches: cfg.maxConcurrentFetches,
    maxNewsItems: cfg.maxNewsItems,
    maxItemChars: cfg.maxItemChars,
    maxTotalChars: cfg.maxTotalChars,
    tavilyApiKey: cfg.tavilyApiKey,
    tavilyTimeRange: (cfg.tavilyTimeRange as NewsConfig["tavilyTimeRange"]) || "d",
    decisionModelName: cfg.decisionModelName,
    // NewsConfig rows written before the newsPoolSize column existed
    // return `null` from Prisma. Fall back to the default so old rows
    // keep behaving sanely after the migration.
    newsPoolSize: cfg.newsPoolSize ?? DEFAULT_NEWS_CONFIG.newsPoolSize,
  };
}

export async function setNewsConfig(cfg: NewsConfig): Promise<void> {
  await prisma.newsConfig.deleteMany();
  await prisma.newsConfig.create({ data: { ...cfg } });
}

export async function ensureNewsConfig(): Promise<NewsConfig> {
  const existing = await prisma.newsConfig.findFirst();
  if (existing) return await getNewsConfig();
  await prisma.newsConfig.create({ data: { ...DEFAULT_NEWS_CONFIG, updatedAt: new Date() } });
  return DEFAULT_NEWS_CONFIG;
}

export interface MessageConfig {
  maxVisibleMessages: number;
  frontendVisible: boolean;
  scrollSpeedSeconds: number;
}

export const DEFAULT_MESSAGE_CONFIG: MessageConfig = {
  maxVisibleMessages: 50,
  frontendVisible: true,
  scrollSpeedSeconds: 80,
};

export async function getMessageConfig(): Promise<MessageConfig> {
  const cfg = await prisma.messageConfig.findFirst();
  if (!cfg) return DEFAULT_MESSAGE_CONFIG;
  return {
    maxVisibleMessages: cfg.maxVisibleMessages,
    frontendVisible: cfg.frontendVisible,
    scrollSpeedSeconds: cfg.scrollSpeedSeconds,
  };
}

export async function setMessageConfig(cfg: MessageConfig): Promise<void> {
  await prisma.messageConfig.deleteMany();
  await prisma.messageConfig.create({
    data: {
      maxVisibleMessages: cfg.maxVisibleMessages,
      frontendVisible: cfg.frontendVisible,
      scrollSpeedSeconds: cfg.scrollSpeedSeconds,
    },
  });
}