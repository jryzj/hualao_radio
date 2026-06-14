import { NextRequest, NextResponse } from "next/server";
import { getNewsConfig, setNewsConfig, type NewsConfig } from "@/config";

export async function GET() {
  const cfg = await getNewsConfig();
  return NextResponse.json(cfg);
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Partial<NewsConfig>;
  const current = await getNewsConfig();
  const next: NewsConfig = {
    prefetchIntervalMs: numField(body.prefetchIntervalMs, current.prefetchIntervalMs, 30_000, 86_400_000),
    updateIntervalMs: numField(body.updateIntervalMs, current.updateIntervalMs, 60_000, 86_400_000 * 7),
    activeWindowMs: numField(body.activeWindowMs, current.activeWindowMs, 60_000, 86_400_000 * 30),
    retentionDays: numField(body.retentionDays, current.retentionDays, 1, 365),
    maxConcurrentFetches: numField(body.maxConcurrentFetches, current.maxConcurrentFetches, 1, 20),
    maxNewsItems: numField(body.maxNewsItems, current.maxNewsItems, 1, 20),
    maxItemChars: numField(body.maxItemChars, current.maxItemChars, 100, 20_000),
    maxTotalChars: numField(body.maxTotalChars, current.maxTotalChars, 200, 50_000),
    tavilyApiKey: typeof body.tavilyApiKey === "string" ? body.tavilyApiKey : current.tavilyApiKey,
    tavilyTimeRange: ["d", "w", "m", "y"].includes(body.tavilyTimeRange as string)
      ? (body.tavilyTimeRange as NewsConfig["tavilyTimeRange"])
      : current.tavilyTimeRange,
    decisionModelName: typeof body.decisionModelName === "string" ? body.decisionModelName : current.decisionModelName,
    newsPoolSize: numField(body.newsPoolSize, current.newsPoolSize, 1, 10_000),
    newsBufferSize: numField(body.newsBufferSize, current.newsBufferSize, 1, 10_000),
  };
  await setNewsConfig(next);
  return NextResponse.json({ ok: true, config: next });
}

function numField(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
