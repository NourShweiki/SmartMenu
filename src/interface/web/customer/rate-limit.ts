/**
 * A sliding-window counter: at most `max` hits per `windowMs` for each key. Kept in memory, so it is per server
 * instance and forgotten on restart: good enough to stop one device (or one restaurant's bill) running away, not a
 * hard guarantee. Pure apart from the injected clock.
 */
export type RateLimiter = { hit(key: string): boolean };

export function makeRateLimiter(opts: { max: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  return {
    /** Counts one request and says whether it is allowed. A refused request is not counted. */
    hit(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      // Drop idle keys now and then so the map cannot grow forever.
      if (hits.size > 5000) for (const [k, v] of hits) if (v.every((at) => t - at >= opts.windowMs)) hits.delete(k);
      return true;
    },
  };
}
