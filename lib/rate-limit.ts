// Best-effort per-instance abuse protection, not a distributed quota.
// Bounded memory; unknown clients share one bucket. No raw IPs are persisted.
import { createHash } from "node:crypto";
export function createRateLimiter(limit: number, windowMs = 60_000, capacity = 5000) {
  const hits = new Map<string, { count: number; expires: number }>();
  return (headers: Headers, now = Date.now()) => {
    // Vercel overwrites this header; do not trust user-supplied forwarded chains.
    const ip = process.env.VERCEL === "1"
      ? headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown"
      : "local";
    const key = createHash("sha256").update(ip).digest("hex");
    for (const [key, bucket] of hits) if (bucket.expires <= now) hits.delete(key);
    const bucket = hits.get(key);
    if (bucket) {
      if (bucket.count >= limit) return true;
      bucket.count++;
    } else {
      if (hits.size >= capacity) return true;
      hits.set(key, { count: 1, expires: now + windowMs });
    }
    return false;
  };
}
