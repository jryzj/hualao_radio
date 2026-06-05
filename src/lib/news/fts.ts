// FTS5 search over RssItem
// Uses Prisma $queryRaw to access the rss_item_fts virtual table.
// Joins back to RssItem and RssSource to filter by source status and to
// retrieve display fields.

import { prisma } from "@/lib/prisma";

export interface FtsResult {
  id: string;
  title: string;
  contentMd: string;
  link: string;
  publishedAt: Date | null;
  sourceId: string;
  sourceTitle: string;
  rank: number;
}

export interface SearchOptions {
  query: string;
  activeWindowMs: number;
  limit?: number;
}

export async function searchRssItems(opts: SearchOptions): Promise<FtsResult[]> {
  if (!opts.query.trim()) return [];
  const limit = opts.limit ?? 3;
  const cutoff = new Date(Date.now() - opts.activeWindowMs);
  const ftsQuery = sanitizeFtsQuery(opts.query);

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        contentMd: string;
        link: string;
        publishedAt: Date | null;
        sourceId: string;
        sourceTitle: string;
        rank: number;
      }>
    >`
      SELECT r.id, r.title, r.contentMd, r.link, r.publishedAt, r.sourceId, s.title AS sourceTitle,
             bm25(rss_item_fts) AS rank
      FROM rss_item_fts f
      JOIN RssItem r ON r.rowid = f.rowid
      JOIN RssSource s ON s.id = r.sourceId
      WHERE rss_item_fts MATCH ${ftsQuery}
        AND r.fetchedAt > ${cutoff}
        AND s.status = 'active'
      ORDER BY rank
      LIMIT ${limit}
    `;
    return rows;
  } catch (err) {
    console.error("[News/fts] search failed:", err);
    return [];
  }
}

// Sanitize query for FTS5: escape quotes, append prefix-match for each token
// to allow partial matching (e.g. "chat" matches "chatgpt").
function sanitizeFtsQuery(q: string): string {
  const tokens = q
    .toLowerCase()
    .split(/[\s,;。、,]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '""';
  return tokens.map((t) => `"${t}"*`).join(" ");
}
