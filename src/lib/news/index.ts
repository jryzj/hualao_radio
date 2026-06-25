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

// Per-theme content buffer for the A-path. Each theme gets one
// buffer that holds up to `NewsConfig.newsBufferSize` items; LLM
// segments consume items sequentially via `cursor`. When exhausted,
// the buffer is refilled from FTS5 + random RSS. This avoids
// re-querying and re-sampling for every segment within the same
// theme, and guarantees that consecutive segments don't repeat
// items until the buffer is fully consumed.
interface NewsBuffer {
  items: NewsItemInput[];
  cursor: number;
  filledAt: number;
}

const globalState = globalThis as unknown as {
  newsServiceStarted: boolean;
  newsCache: NewsCache;
  newsBuffer: Map<string, NewsBuffer>;
  rssRefreshTimer?: NodeJS.Timeout;
  pruneTimer?: NodeJS.Timeout;
};

if (globalState.newsServiceStarted === undefined) globalState.newsServiceStarted = false;
if (globalState.newsCache === undefined) {
  globalState.newsCache = { context: "", updatedAt: 0, source: null };
}
if (globalState.newsBuffer === undefined) {
  globalState.newsBuffer = new Map();
}

class NewsService {
  // A-path: per-theme content buffer. Each theme gets one buffer
  // holding up to `cfg.newsBufferSize` items (default 100). The
  // LLM consumes `cfg.maxNewsItems` items per segment, advancing
  // the cursor; when exhausted, the buffer is refilled via
  // `fillBuffer` (FTS5 + random RSS).
  //
  // `description` is the active theme's `description` field, used as
  // the FTS5 query when filling. Empty description -> pure random.
  async getCurrentNews(themeId: string, description: string): Promise<string> {
    const cfg = await getNewsConfig();
    const k = cfg.maxNewsItems;

    let buf = globalState.newsBuffer.get(themeId);
    if (!buf || buf.cursor >= buf.items.length) {
      buf = await fillBuffer(themeId, description, cfg);
      globalState.newsBuffer.set(themeId, buf);
    }

    const taken = takeFromBuffer(buf, k);
    if (taken.length === 0) {
      console.log(`[NewsService] A-path: 0 items (themeId=${themeId})`);
      return "";
    }
    const context = formatNewsContext(taken, {
      maxItems: k,
      maxItemChars: cfg.maxItemChars,
      maxTotalChars: cfg.maxTotalChars,
    });
    console.log(
      `[NewsService] A-path: ${taken.length} items, ${context.length} chars (themeId=${themeId}, cursor=${buf.cursor}/${buf.items.length})`,
    );
    return context;
  }

  invalidateCache(): void {
    globalState.newsCache = { context: "", updatedAt: 0, source: null };
  }

  // C-path: synchronous search triggered by listener messages.
  //
  // `description` is the active theme's description. It is appended
  // to the listener message so both FTS5 (local RSS pool) and Tavily
  // (web fallback) search with a combined query:
  //   "听众消息 美食新闻，美食文化，美食菜谱"
  // The topic anchor measurably improves Tavily relevance for short,
  // ambiguous listener inputs (e.g. "今天白斩鸡怎么样" — without the
  // theme context, the result set is dominated by unrelated news).
  // Empty description degrades cleanly to the message alone.
  async triggerCPathSync(messages: string, description: string): Promise<string> {
    if (!messages.trim()) return "";
    const cfg = await getNewsConfig();
    const llm = await getLLMConfig();
    if (!llm) {
      console.warn("[NewsService] LLMConfig missing, C-path skip");
      return "";
    }
    const desc = description?.trim() ?? "";
    const query = desc ? `${messages} ${desc}` : messages;
    const results = await runSearch(query, cfg);
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

// A-path orchestrator: FTS5 over the local RSS pool, top up with
// Tavily if the local hits are short, top up with random RSS
// (excluding already-picked links) if FTS5+Tavily combined are
// still short, fall back to a random sample when no query is
// provided (theme.description empty / unset).
async function pickRandomItems(cfg: Cfg, excludeLinks: Set<string> = new Set(), count?: number): Promise<NewsItemInput[]> {
  const cutoff = new Date(Date.now() - cfg.activeWindowMs);
  // Pool size is now operator-controlled via `newsPoolSize` (default 100).
  // We still floor it at `maxNewsItems` so the operator can never set a
  // pool smaller than the pick count, which would otherwise silently
  // shrink the rendered {{news}} list.
  const poolSize = Math.max(cfg.newsPoolSize, cfg.maxNewsItems);
  // Pick count defaults to `maxNewsItems` for legacy callers; the
  // buffer-fill path passes an explicit count (default 100).
  const pickCount = count ?? cfg.maxNewsItems;

  const candidates = await prisma.rssItem.findMany({
    where: {
      publishedAt: { gt: cutoff, not: null },
      source: { status: "active" },
      ...(excludeLinks.size > 0 ? { link: { notIn: [...excludeLinks] } } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: poolSize,
    include: { source: { select: { title: true, url: true } } },
  });

  if (candidates.length === 0) {
    return [];
  }

  const picked = shuffle(candidates).slice(0, pickCount);
  return picked.map((c) => ({
    title: c.title,
    contentMd: c.contentMd,
    link: c.link,
    sourceTitle: c.source.title || c.source.url,
    publishedAt: c.publishedAt,
    fetchedAt: c.fetchedAt,
  }));
}

// Fill (or refill) the per-theme content buffer.
// Strategy: FTS5 over the RSS pool with the theme's description as
// the query (when non-empty), top up with Tavily (when configured)
// if FTS5 falls short, then random RSS items (excluding already-
// picked links) for any remaining gap. Order in the buffer: FTS5
// hits first, then Tavily, then random — all source-relevant to
// the description until the random tail.
async function fillBuffer(
  themeId: string,
  description: string,
  cfg: Cfg,
): Promise<NewsBuffer> {
  const want = Math.max(cfg.newsBufferSize, 1);
  const desc = description?.trim() ?? "";

  // 1) FTS5（描述非空时）
  let ftsItems: NewsItemInput[] = [];
  if (desc) {
    try {
      const ftsResults = await searchRssItems({
        query: desc,
        activeWindowMs: cfg.activeWindowMs,
        limit: want,
      });
      ftsItems = resultsToInputs(ftsResults);
    } catch (err) {
      console.error("[NewsService] fillBuffer FTS5 failed:", err);
    }
  }

  if (ftsItems.length >= want) {
    const items = shuffle(ftsItems);
    console.log(`[NewsService] buffer filled: ${items.length} items (themeId=${themeId}, FTS5-only)`);
    return { items, cursor: 0, filledAt: Date.now() };
  }

  // 2) Tavily 补差（如果配了 key）
  let tavilyItems: NewsItemInput[] = [];
  if (cfg.tavilyApiKey) {
    const need = want - ftsItems.length;
    try {
      const tavilyResults = await tavilySearch({
        apiKey: cfg.tavilyApiKey,
        query: desc,
        timeRange: cfg.tavilyTimeRange,
        maxResults: need,
      });
      tavilyItems = resultsToInputs(
        tavilyResults.map((r) => ({ ...r, sourceTitle: "Tavily" })),
      );
    } catch (err) {
      // Tavily 失败/超配额：忽略，下一步走随机补差
      console.error("[NewsService] fillBuffer Tavily top-up failed:", err);
    }
  }

  // 3) 合并 FTS5 + Tavily，看是否还差
  const combined = [...ftsItems, ...tavilyItems];
  if (combined.length >= want) {
    console.log(
      `[NewsService] buffer filled: ${combined.length} items (themeId=${themeId}, FTS5=${ftsItems.length}, Tavily=${tavilyItems.length})`,
    );
    return { items: combined, cursor: 0, filledAt: Date.now() };
  }

  // 4) 仍然不足 → 随机补差（排除 FTS5 + Tavily 已选 link）
  const need = want - combined.length;
  const excludeLinks = new Set(
    combined.map((i) => i.link).filter((l): l is string => typeof l === "string" && l.length > 0),
  );
  const randomItems = await pickRandomItems(cfg, excludeLinks, need);
  const items = [...combined, ...randomItems];
  console.log(
    `[NewsService] buffer filled: ${items.length} items (themeId=${themeId}, FTS5=${ftsItems.length}, Tavily=${tavilyItems.length}, random=${randomItems.length})`,
  );
  return { items, cursor: 0, filledAt: Date.now() };
}

// Take the next `k` items from the buffer in insertion order.
// Returns fewer than `k` when the buffer tail is short; advances
// the cursor by the actual slice length.
function takeFromBuffer(buf: NewsBuffer, k: number): NewsItemInput[] {
  const start = buf.cursor;
  const end = Math.min(start + k, buf.items.length);
  if (start >= end) return [];
  const slice = buf.items.slice(start, end);
  buf.cursor = end;
  return slice;
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
