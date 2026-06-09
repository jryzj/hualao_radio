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

import { prisma, withBusyRetry } from "@/lib/prisma";
import { getLLMConfig, getNewsConfig, ensureNewsConfig, type NewsConfig as Cfg } from "@/config";
import { fetchAllSources, fetchRssSource, type FetchedItem } from "./rss";
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

<<<<<<< HEAD
  // Force an immediate refresh of a single source by id.
  async refreshSource(id: string): Promise<{ ok: boolean; items: number; error?: string }> {
    const source = await prisma.rssSource.findUnique({ where: { id } });
    if (!source) return { ok: false, items: 0, error: "NOT_FOUND" };
    const results = await fetchAllSources([{ id: source.id, url: source.url }], 1);
    const r = results[0];
    if (!r.result.ok) {
      await markSourceFailure(id);
      return { ok: false, items: 0, error: r.result.error };
    }
    const items = await writeItems(id, r.result.items);
    await markSourceSuccess(id, r.result.feedTitle);
    return { ok: true, items };
=======
  // Force an immediate RSS refresh of a single source by id. Returns the
  // per-source outcome so the admin UI can surface a precise error
  // (e.g. "NOT_FOUND" if the id was deleted between page load and click,
  // or the underlying parser error from fetchRssSource). On success
  // `items` is the list of items written to the DB so the caller can
  // show "fetched N new items" without a second round-trip.
  async refreshSource(id: string): Promise<
    { ok: true; items: FetchedItem[] } | { ok: false; error: string }
  > {
    return await runSingleSourceRefresh(id);
>>>>>>> side1
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

// Refresh a single source by id (used by admin/news "refresh" button).
// Returned shape matches what the API route expects:
//   { ok: true, items: FetchedItem[] }              — on success
//   { ok: false, error: "NOT_FOUND" | "<message>" } — on missing
//                                                      source or fetch error
// `writeItems` upserts by (sourceId, link), so a manual refresh is
// idempotent — re-running it just refreshes `fetchedAt` on existing rows
// and adds any new items the source has published since last cycle.
async function runSingleSourceRefresh(id: string): Promise<
  { ok: true; items: FetchedItem[] } | { ok: false; error: string }
> {
  const src = await prisma.rssSource.findUnique({ where: { id } });
  if (!src) return { ok: false, error: "NOT_FOUND" };
  const result = await fetchRssSource(src.url);
  if (!result.ok) {
    await markSourceFailure(id);
    return { ok: false, error: result.error ?? "fetch failed" };
  }
  const written = await writeItems(id, result.items);
  await markSourceSuccess(id, result.feedTitle);
  console.log(`[NewsService] single refresh: ${src.url} → ${written} items`);
  return { ok: true, items: result.items };
}

async function markSourceSuccess(id: string, feedTitle?: string) {
  await withBusyRetry(() => prisma.rssSource.update({
    where: { id },
    data: {
      failCount: 0,
      status: "active",
      lastFetchedAt: new Date(),
      ...(feedTitle && !titleEmpty(feedTitle) ? { title: feedTitle } : {}),
    },
  }));
}

async function markSourceFailure(id: string) {
  const src = await prisma.rssSource.findUnique({ where: { id } });
  if (!src) return;
  const newCount = src.failCount + 1;
  const newStatus = newCount >= 3 ? "disabled" : src.status;
  await withBusyRetry(() => prisma.rssSource.update({
    where: { id },
    data: { failCount: newCount, status: newStatus, lastFetchedAt: new Date() },
  }));
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
      await withBusyRetry(() => prisma.rssItem.upsert({
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
      }));
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
    //
    // Batched delete: a single big deleteMany holds SQLite's global
    // write lock for the full duration, which trips libsql's socket
    // timeout (P1008) once the candidate set gets into the thousands.
    // Each iteration is an independent read-then-delete transaction, so
    // the write lock is released between batches and concurrent readers
    // (and the RSS refresh) keep moving. Order by fetchedAt ASC so we
    // drain oldest first and the partial-progress state stays
    // self-consistent if the cycle is interrupted.
    const BATCH = 200;
    let total = 0;
    while (true) {
      const candidates = await prisma.rssItem.findMany({
        where: {
          OR: [
            { publishedAt: { lt: cutoff } },
            { publishedAt: null, fetchedAt: { lt: cutoff } },
          ],
        },
        select: { id: true },
        take: BATCH,
        orderBy: { fetchedAt: "asc" },
      });
      if (candidates.length === 0) break;
      const ids = candidates.map(c => c.id);
      const r = await withBusyRetry(() => prisma.rssItem.deleteMany({ where: { id: { in: ids } } }));
      total += r.count;
      if (candidates.length < BATCH) break;
    }
    if (total > 0) {
      console.log(`[NewsService] Pruned ${total} items older than ${cfg.retentionDays}d (by publishedAt, fallback fetchedAt, batched)`);
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
