// A minimal in-memory rate limiter — good enough to blunt casual abuse of
// /api/restore-access (which otherwise lets someone probe arbitrary email
// addresses to see if they have an active subscription). It resets on
// cold start and isn't shared across serverless instances, so it's not a
// substitute for a real rate-limiting service (e.g. Upstash Ratelimit,
// Vercel Firewall rules) if this endpoint sees meaningful traffic — but
// it's a real improvement over nothing with zero extra infrastructure.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, limit = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}
