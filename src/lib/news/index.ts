// NewsService — singleton managing the news pool lifecycle.
//
// Responsibilities:
//   - Prefetch cycle (A-path): every `prefetchIntervalMs`, randomly sample
//     `maxNewsItems` RSS items from the active window and cache them.
//   - C-path trigger: when LiveEngine has pending listener messages, do a
//     synchronous FTS5 search (with Tavily fallback) and override the cache.
//   - Hourly pruning of RssItem rows older than `retentionDays`.
//   - Periodic RSS refresh of all active sources.
//
// State is kept on globalThis so it survives Next.js hot reloads in dev.

import { prisma } from "@/lib/prisma";
import { getLLMConfig, getNewsConfig, ensureNewsConfig, type NewsConfig as Cfg } from "@/config";
import { fetchAllSources, type FetchedItem } from "./rss";
import { searchRssItems, type FtsResult } from "./fts";
import { tavilySearch, type TavilyResult } from "./tavily";
import { formatNewsContext, type NewsItemInput } from "./format";

interface NewsCache {
  context: string;
  updatedAt: number;
  source: "A" | "C" | null;
}

const globalState = globalThis as unknown as {
  newsServiceStarted: boolean;
  newsCache: NewsCache;
  rssRefreshTimer?: NodeJS.Timeout;
  pruneTimer?: NodeJS.Timeout;
};

if (globalState.newsServiceStarted === undefined) globalState.newsServiceStarted = false;
if (globalState.newsCache === undefined) {
  globalState.newsCache = { context: "", updatedAt: 0, source: null };
}

class NewsService {
  // A-path: pick 3 random RSS items fresh on every call so each LLM
  // segment gets a different set from the previous one.
  async getCurrentNews(): Promise<string> {
    const cfg = await getNewsConfig();
    const items = await pickRandomItems(cfg);
    if (items.length === 0) {
      return "";
    }
    const context = formatNewsContext(items, {
      maxItems: cfg.maxNewsItems,
      maxItemChars: cfg.maxItemChars,
      maxTotalChars: cfg.maxTotalChars,
    });
    console.log(
      `[NewsService] A-path: ${items.length} random items picked, ${context.length} chars`,
    );
    return context;
  }

  invalidateCache(): void {
    globalState.newsCache = { context: "", updatedAt: 0, source: null };
  }

  // C-path: synchronous search triggered by listener messages.
  async triggerCPathSync(messages: string): Promise<string> {
    if (!messages.trim()) return "";
    const cfg = await getNewsConfig();
    const llm = await getLLMConfig();
    if (!llm) {
      console.warn("[NewsService] LLMConfig missing, C-path skip");
      return "";
    }
    const results = await runSearch(messages, cfg);
    const items = resultsToInputs(results);
    const context = formatNewsContext(items, {
      maxItems: cfg.maxNewsItems,
      maxItemChars: cfg.maxItemChars,
      maxTotalChars: cfg.maxTotalChars,
    });
    globalState.newsCache = { context, updatedAt: Date.now(), source: "C" };
    return context;
  }

  // Force an immediate RSS refresh of all active sources.
  async refreshAllSources(): Promise<{ fetched: number; failed: number; items: number }> {
    return await runRssRefresh();
  }
}

async function runRssRefresh(): Promise<{ fetched: number; failed: number; items: number }> {
  const cfg = await getNewsConfig();
  const sources = await prisma.rssSource.findMany({ where: { status: "active" } });
  if (sources.length === 0) return { fetched: 0, failed: 0, items: 0 };
  const results = await fetchAllSources(
    sources.map((s) => ({ id: s.id, url: s.url })),
    cfg.maxConcurrentFetches,
  );
  let fetched = 0;
  let failed = 0;
  let items = 0;
  for (const { id, result } of results) {
    if (!result.ok) {
      failed++;
      await markSourceFailure(id);
      continue;
    }
    fetched++;
    items += await writeItems(id, result.items);
    await markSourceSuccess(id, result.feedTitle);
  }
  console.log(`[NewsService] RSS refresh: ${fetched} ok, ${failed} failed, ${items} items`);
  return { fetched, failed, items };
}

async function markSourceSuccess(id: string, feedTitle?: string) {
  await prisma.rssSource.update({
    where: { id },
    data: {
      failCount: 0,
      status: "active",
      lastFetchedAt: new Date(),
      ...(feedTitle && !titleEmpty(feedTitle) ? { title: feedTitle } : {}),
    },
  });
}

async function markSourceFailure(id: string) {
  const src = await prisma.rssSource.findUnique({ where: { id } });
  if (!src) return;
  const newCount = src.failCount + 1;
  const newStatus = newCount >= 3 ? "disabled" : src.status;
  await prisma.rssSource.update({
    where: { id },
    data: { failCount: newCount, status: newStatus, lastFetchedAt: new Date() },
  });
  if (newStatus === "disabled") {
    console.warn(`[NewsService] source ${src.url} disabled after ${newCount} failures`);
  }
}

function titleEmpty(t: string): boolean {
  return !t || t.trim().length === 0;
}

async function writeItems(sourceId: string, items: FetchedItem[]): Promise<number> {
  let written = 0;
  for (const it of items) {
    if (!it.link) continue;
    try {
      await prisma.rssItem.upsert({
        where: { sourceId_link: { sourceId, link: it.link } },
        create: {
          sourceId,
          link: it.link,
          title: it.title,
          publishedAt: it.publishedAt,
          contentMd: it.contentMd,
          description: it.description,
        },
        update: {
          title: it.title,
          publishedAt: it.publishedAt,
          contentMd: it.contentMd,
          description: it.description,
          fetchedAt: new Date(),
        },
      });
      written++;
    } catch (err) {
      console.error("[NewsService] writeItem error:", err);
    }
  }
  return written;
}

async function runSearch(query: string, cfg: Cfg): Promise<Array<FtsResult | TavilyResult & { sourceTitle: string }>> {
  const rssResults = await searchRssItems({
    query,
    activeWindowMs: cfg.activeWindowMs,
    limit: cfg.maxNewsItems,
  });
  if (rssResults.length > 0) return rssResults;

  if (!cfg.tavilyApiKey) return [];
  try {
    const tavilyResults = await tavilySearch({
      apiKey: cfg.tavilyApiKey,
      query,
      timeRange: cfg.tavilyTimeRange,
      maxResults: cfg.maxNewsItems,
    });
    return tavilyResults.map((r) => ({
      ...r,
      sourceTitle: "Tavily",
    }));
  } catch (err) {
    console.error("[NewsService] Tavily search failed:", err);
    return [];
  }
}

function resultsToInputs(results: Array<FtsResult | (TavilyResult & { sourceTitle: string })>): NewsItemInput[] {
  return results.map((r) => {
    const rssLike = r as FtsResult;
    const tavilyLike = r as TavilyResult & { sourceTitle: string };
    if (rssLike.contentMd !== undefined) {
      return {
        title: rssLike.title,
        contentMd: rssLike.contentMd,
        link: rssLike.link,
        sourceTitle: rssLike.sourceTitle,
        publishedAt: rssLike.publishedAt,
        fetchedAt: new Date(),
      };
    }
    return {
      title: tavilyLike.title,
      contentMd: tavilyLike.raw_content || tavilyLike.content || "",
      link: tavilyLike.url,
      sourceTitle: tavilyLike.sourceTitle,
      publishedAt: null,
      fetchedAt: new Date(),
    };
  });
}

async function pickRandomItems(cfg: Cfg): Promise<NewsItemInput[]> {
  const cutoff = new Date(Date.now() - cfg.activeWindowMs);
  const poolSize = Math.max(cfg.maxNewsItems * 10, 30);

  const candidates = await prisma.rssItem.findMany({
    where: {
      publishedAt: { gt: cutoff, not: null },
      source: { status: "active" },
    },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: poolSize,
    include: { source: { select: { title: true, url: true } } },
  });

  if (candidates.length === 0) {
    return [];
  }

  const picked = shuffle(candidates).slice(0, cfg.maxNewsItems);
  return picked.map((c) => ({
    title: c.title,
    contentMd: c.contentMd,
    link: c.link,
    sourceTitle: c.source.title || c.source.url,
    publishedAt: c.publishedAt,
    fetchedAt: c.fetchedAt,
  }));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function rssRefreshCycle(): Promise<void> {
  try {
    await runRssRefresh();
  } catch (err) {
    console.error("[NewsService] RSS refresh cycle error:", err);
  }
}

async function pruneCycle(): Promise<void> {
  try {
    const cfg = await getNewsConfig();
    const cutoff = new Date(Date.now() - cfg.retentionDays * 86_400_000);
    // Retention is based on content age (publishedAt), not fetch age.
    // For items missing publishedAt, fall back to fetchedAt so they don't
    // accumulate forever.
    const r = await prisma.rssItem.deleteMany({
      where: {
        OR: [
          { publishedAt: { lt: cutoff } },
          { publishedAt: null, fetchedAt: { lt: cutoff } },
        ],
      },
    });
    if (r.count > 0) {
      console.log(`[NewsService] Pruned ${r.count} items older than ${cfg.retentionDays}d (by publishedAt, fallback fetchedAt)`);
    }
  } catch (err) {
    console.error("[NewsService] Prune error:", err);
  }
}

async function startService(): Promise<void> {
  if (globalState.newsServiceStarted) return;
  globalState.newsServiceStarted = true;

  await ensureNewsConfig();
  const cfg = await getNewsConfig();

  // On startup: if DB has no items (first start), trigger an immediate RSS
  // refresh so the first LLM call has something to sample from.
  // On restart, DB already has items — skip the refresh.
  const itemCount = await prisma.rssItem.count();
  if (itemCount === 0) {
    console.log("[NewsService] start: DB empty, triggering initial RSS refresh");
    try {
      await runRssRefresh();
    } catch (err) {
      console.error("[NewsService] start: initial RSS refresh failed:", err);
    }
  } else {
    console.log(`[NewsService] start: DB has ${itemCount} items, skipping initial RSS refresh`);
  }

  // Schedule RSS refresh (every 10s check, but run at updateIntervalMs cadence)
  let lastRssRefresh = 0;
  globalState.rssRefreshTimer = setInterval(async () => {
    const now = Date.now();
    if (now - lastRssRefresh >= cfg.updateIntervalMs) {
      lastRssRefresh = now;
      await rssRefreshCycle();
    }
  }, 10_000);

  // Schedule hourly prune
  globalState.pruneTimer = setInterval(() => {
    pruneCycle().catch((err) => console.error("[NewsService] prune err:", err));
  }, 3_600_000);

  // A-path news is now sampled fresh per LLM call (see getCurrentNews),
  // so no prefetch timer is needed.
  console.log(
    `[NewsService] Started: A-path=per-call random ${cfg.maxNewsItems}, rssRefresh=${cfg.updateIntervalMs}ms, prune=1h`,
  );
}

// Auto-start on module load (singleton pattern, like LiveEngine)
startService().catch((err) => {
  console.error("[NewsService] start failed:", err);
  // The most common cause of a "no such table" error here is a DB that
  // hasn't had the latest migrations applied. Print a one-liner so the
  // operator doesn't have to decode the Prisma error to figure out
  // what to do.
  const msg = err instanceof Error ? `${err.message} ${err.cause ? JSON.stringify((err.cause as Record<string, unknown>)) : ""}` : String(err);
  if (/no such table/i.test(msg)) {
    console.error(
      "[NewsService] hint: run `npx prisma migrate deploy` on the server — the database is missing one or more migrations.",
    );
  }
});

export const newsService = new NewsService();
