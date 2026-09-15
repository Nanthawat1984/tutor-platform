// In-memory per-identifier rate limiter for upload endpoints.
// Single-instance best effort (documented): it stops casual abuse/double-submit
// floods on one server instance. For multi-instance abuse protection, move to a
// shared store (Firestore/Redis). Limits are deliberately small and fail-open
// only when the limiter itself errors — never block legitimate traffic.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAfterMs: number;
}

export function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000,
  now = Date.now(),
): RateLimitResult {
  try {
    const bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1, resetAfterMs: windowMs };
    }
    if (bucket.count >= limit) {
      return { ok: false, remaining: 0, resetAfterMs: Math.max(0, bucket.resetAt - now) };
    }
    bucket.count += 1;
    return { ok: true, remaining: limit - bucket.count, resetAfterMs: Math.max(0, bucket.resetAt - now) };
  } catch {
    return { ok: true, remaining: limit, resetAfterMs: windowMs };
  }
}

// Periodic cleanup so the map cannot grow unbounded in long-lived servers.
let lastSweep = 0;
export function sweepRateLimitBuckets(now = Date.now()): void {
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
  if (buckets.size > 10_000) buckets.clear();
}
