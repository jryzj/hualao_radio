// Tiny in-memory token-bucket-ish rate limiter, scoped per process.
// Good enough for a single-host app to defeat casual abuse; for
// production you'd back this with Redis.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  // Maximum requests allowed within `windowMs`.
  limit: number;
  // Rolling window length in ms.
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    const fresh: Bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(key, fresh);
    return { allowed: true, remaining: opts.limit - 1, resetAt: fresh.resetAt };
  }
  if (b.count >= opts.limit) {
    return { allowed: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count += 1;
  return { allowed: true, remaining: opts.limit - b.count, resetAt: b.resetAt };
}

// Periodic sweep so the map doesn't grow unboundedly.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k);
    }
  }, 60_000).unref?.();
}

export function clientIp(req: Request): string {
  // Trust X-Forwarded-For only if you've set up a reverse proxy
  // that strips/sets it. As a safe default, fall back to a single
  // shared bucket per request to avoid leaking IPs into log lines.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
