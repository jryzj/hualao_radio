// Tavily search API client
// POST https://api.tavily.com/search
// Docs: https://docs.tavily.com/docs/rest-api/api-reference

export type TavilyTimeRange = "d" | "w" | "m" | "y";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  score?: number;
}

export interface TavilySearchOptions {
  apiKey: string;
  query: string;
  timeRange?: TavilyTimeRange;
  maxResults?: number;
  signal?: AbortSignal;
}

export async function tavilySearch(opts: TavilySearchOptions): Promise<TavilyResult[]> {
  if (!opts.apiKey) {
    throw new Error("Tavily API key is empty");
  }
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: opts.apiKey,
      query: opts.query,
      max_results: opts.maxResults ?? 3,
      time_range: opts.timeRange ?? "d",
      include_raw_content: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}
