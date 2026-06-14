// Standalone test: search the dev DB's RssItem FTS5 index for a given
// theme, restricted to a recent time window (or all time), and report
// the hit count plus a few sample rows so you can eyeball whether the
// index is behaving the way you expect with Chinese / CJK queries.
//
// Usage:
//   node scripts/test-search-news.cjs                          # default: 美食 / 24h / limit 20
//   node scripts/test-search-news.cjs 美食                      # 美食 / 24h
//   node scripts/test-search-news.cjs 美食 0                    # 美食 / all-time (no window)
//   node scripts/test-search-news.cjs 美食 48                   # 美食 / last 48h
//   node scripts/test-search-news.cjs 美食 24 50                # 美食 / last 24h / limit 50
//   node scripts/test-search-news.cjs 美食 24 20 publishedAt   # 美食 / last 24h / limit 20 / date field = publishedAt
//   node scripts/test-search-news.cjs 美食 0 200 publishedAt    # 美食 / all-time / limit 200 / by publishedAt
//
// Notes:
//   - Uses the same FTS5 MATCH + bm25 ORDER BY that the live engine
//     uses (see src/lib/news/fts.ts:25). Default cutoff field matches
//     the existing search behavior.
//   - `hours = 0` means "no time window" (search the whole pool).
//   - Filter on `publishedAt` may return fewer rows because items
//     with null publishedAt are skipped (rss.ts drops them on fetch).

const { createClient } = require('@libsql/client');

const query = process.argv[2] ?? '美食';
const hoursArg = process.argv[3] ?? '24';
const hours = hoursArg === 'all' || hoursArg === '0' ? 0 : Number(hoursArg);
const limit = Number(process.argv[4] ?? 20);
const dateField = (process.argv[5] ?? 'fetchedAt') === 'publishedAt' ? 'publishedAt' : 'fetchedAt';

if (!Number.isFinite(hours) || hours < 0) {
  console.error(`Invalid hours: ${process.argv[3]} (use 0 or 'all' for no window)`);
  process.exit(1);
}
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`Invalid limit: ${process.argv[4]}`);
  process.exit(1);
}

// libsql returns Prisma's DateTime columns as ISO 8601 strings (the
// same way Prisma stores them in SQLite). Pass the cutoff as an ISO
// string too so the comparison is text-vs-text (lexicographic ==
// chronological for the same format).
function toIso(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  // Already an ISO string — return as-is for display.
  if (typeof v === 'string') return v;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? new Date(v).toISOString() : null;
  }
  return null;
}

// Same sanitizer the live engine uses (src/lib/news/fts.ts:64).
// Splits on whitespace + CJK punctuation, strips non-letter/digit,
// adds prefix-match to allow partial tokens (e.g. "chat" → "chat"*).
function sanitizeFtsQuery(q) {
  const tokens = q
    .toLowerCase()
    .split(/[\s,;。、,]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '""';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

(async () => {
  const client = createClient({ url: 'file:dev.db' });
  const hasWindow = hours > 0;
  const cutoff = hasWindow ? new Date(Date.now() - hours * 3600 * 1000) : null;
  const ftsQuery = sanitizeFtsQuery(query);

  console.log('=== FTS5 news search ===');
  console.log(`query:        ${JSON.stringify(query)}`);
  console.log(`FTS5 query:   ${JSON.stringify(ftsQuery)}`);
  console.log(`window:       ${hasWindow ? `last ${hours}h (since ${cutoff.toISOString()})` : 'all time (no cutoff)'}`);
  console.log(`date field:   ${dateField}`);
  console.log(`limit:        ${limit}`);
  console.log('');

  const t0 = Date.now();
  let rows;
  try {
    // When hasWindow is false, drop the time predicate entirely.
    const sql = `
      SELECT r.id, r.title, r.link, r.publishedAt, r.fetchedAt, s.title AS sourceTitle,
             bm25(rss_item_fts) AS rank
      FROM rss_item_fts f
      JOIN RssItem r ON r.rowid = f.rowid
      JOIN RssSource s ON s.id = r.sourceId
      WHERE rss_item_fts MATCH ?
        ${hasWindow ? `AND r.${dateField} > ?` : ''}
        AND s.status = 'active'
      ORDER BY rank
      LIMIT ?
    `;
    const args = hasWindow
      ? [ftsQuery, cutoff.toISOString(), limit]
      : [ftsQuery, limit];
    const result = await client.execute({ sql, args });
    rows = result.rows;
  } catch (err) {
    console.error('FTS5 query failed:', err.message);
    client.close();
    process.exit(1);
  }
  const elapsed = Date.now() - t0;

  console.log(`hits:         ${rows.length}  (${elapsed} ms)`);
  console.log('');

  if (rows.length > 0) {
    console.log('--- top 5 ---');
    for (const r of rows.slice(0, 5)) {
      const pub = toIso(r.publishedAt) ?? 'null';
      const fet = toIso(r.fetchedAt) ?? 'null';
      const title = (r.title || '').replace(/\s+/g, ' ').slice(0, 60);
      console.log(`  [${r.rank?.toFixed?.(2) ?? r.rank}] ${title}`);
      console.log(`     source=${r.sourceTitle}  pub=${pub}  fet=${fet}`);
    }
  } else {
    console.log('(no hits)');
  }

  // Also report the total pool size for context (how many items exist
  // in the active window at all, regardless of query).
  if (hasWindow) {
    try {
      const total = await client.execute({
        sql: `SELECT COUNT(*) AS n FROM RssItem r JOIN RssSource s ON s.id = r.sourceId WHERE r.${dateField} > ? AND s.status = 'active'`,
        args: [cutoff.toISOString()],
      });
      console.log('');
      console.log(`(active pool size in last ${hours}h: ${total.rows[0].n})`);
    } catch {
      // best-effort; ignore
    }
  } else {
    try {
      const total = await client.execute({
        sql: `SELECT COUNT(*) AS n FROM RssItem r JOIN RssSource s ON s.id = r.sourceId WHERE s.status = 'active'`,
        args: [],
      });
      console.log('');
      console.log(`(active pool size, all time: ${total.rows[0].n})`);
    } catch {
      // best-effort; ignore
    }
  }

  client.close();
})();
