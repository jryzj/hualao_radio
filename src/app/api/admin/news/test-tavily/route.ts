import { NextRequest, NextResponse } from "next/server";
import { tavilySearch, type TavilyTimeRange } from "@/lib/news/tavily";
import { getNewsConfig } from "@/config";

// One-shot test endpoint for the Tavily integration. Reads the key
// from the NewsConfig table (the same key the live engine uses),
// hits api.tavily.com/search with the supplied query / time range,
// and returns the raw result so an operator can confirm that
// (a) the saved key is valid, (b) the time-range filter behaves as
// expected, and (c) the response shape matches what the C-path /
// A-path code consumes.
//
// Query params (all optional except `q`):
//   q          — search query (URL-encoded)
//   range      — d | w | m | y  (defaults to config.tavilyTimeRange)
//   max        — 1..20          (defaults to config.maxNewsItems)
//
// This route is intentionally read-only with respect to the DB and
// has no side effects on the news pipeline. Safe to call from a
// browser or curl.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim();
  if (!query) {
    return NextResponse.json(
      { ok: false, error: "missing query param `q`" },
      { status: 400 },
    );
  }

  const cfg = await getNewsConfig();
  if (!cfg.tavilyApiKey) {
    return NextResponse.json(
      { ok: false, error: "tavilyApiKey is empty in NewsConfig" },
      { status: 400 },
    );
  }

  const allowed: TavilyTimeRange[] = ["d", "w", "m", "y"];
  const rangeParam = params.get("range");
  const timeRange: TavilyTimeRange = allowed.includes(rangeParam as TavilyTimeRange)
    ? (rangeParam as TavilyTimeRange)
    : cfg.tavilyTimeRange;

  const maxParam = Number(params.get("max"));
  const maxResults = Number.isFinite(maxParam) && maxParam >= 1 && maxParam <= 20
    ? Math.floor(maxParam)
    : cfg.maxNewsItems;

  const startedAt = Date.now();
  try {
    const results = await tavilySearch({
      apiKey: cfg.tavilyApiKey,
      query,
      timeRange,
      maxResults,
    });
    return NextResponse.json({
      ok: true,
      query,
      timeRange,
      maxResults,
      elapsedMs: Date.now() - startedAt,
      count: results.length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
