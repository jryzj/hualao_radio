// RSS / ATOM feed fetcher
// Uses rss-parser to handle RSS 2.0, ATOM 1.0, RDF; turndown to convert
// HTML content to markdown.

import Parser from "rss-parser";
import TurndownService from "turndown";

export interface FetchedItem {
  link: string;
  title: string;
  publishedAt: Date | null;
  contentMd: string;
  description: string;
}

export interface FetchResult {
  ok: boolean;
  items: FetchedItem[];
  error?: string;
  feedTitle?: string;
}

const parser = new Parser({ timeout: 10_000 });
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.remove(["script", "style", "iframe", "noscript"]);

export async function fetchRssSource(url: string): Promise<FetchResult> {
  try {
    const feed = await parser.parseURL(url);
    const items: FetchedItem[] = (feed.items ?? [])
      .map((it) => {
        const html = pickContentHtml(it);
        const contentMd = html ? turndown.turndown(html) : "";
        const description = stripHtml(it.contentSnippet || it.summary || it.description || "");
        return {
          link: (it.link || it.guid || "").trim(),
          title: (it.title || "").trim(),
          publishedAt: parseDate(it.isoDate || it.pubDate),
          contentMd,
          description: description.substring(0, 500),
        };
      })
      .filter((it): it is FetchedItem => it.publishedAt !== null);
    return { ok: true, items, feedTitle: feed.title };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, items: [], error: message };
  }
}

function pickContentHtml(item: Parser.Item & Record<string, unknown>): string {
  const candidates = ["content:encoded", "content", "summary", "description"];
  for (const key of candidates) {
    const v = (item as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

// All sources in parallel with bounded concurrency.
// Returns one result per input source (same order).
export async function fetchAllSources(
  sources: Array<{ id: string; url: string }>,
  concurrency: number,
): Promise<Array<{ id: string; result: FetchResult }>> {
  const limit = Math.max(1, Math.min(concurrency, 20));
  const results: Array<{ id: string; result: FetchResult }> = new Array(sources.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < sources.length) {
      const idx = cursor++;
      const s = sources[idx];
      const result = await fetchRssSource(s.url);
      results[idx] = { id: s.id, result };
    }
  };
  const workers = Array.from({ length: Math.min(limit, sources.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
