/**
 * A sliding-window counter: at most `max` hits per `windowMs` for each key. Kept in memory, so it is per server
 * instance and forgotten on restart: good enough to stop one device (or one restaurant's bill) running away, not a
 * hard guarantee. Pure apart from the injected clock.
 */
export type RateLimiter = { hit(key: string): boolean };

/** Idle keys are swept at most this often (not on every request), and the map never holds more than MAX_KEYS keys. */
const SWEEP_EVERY_MS = 10_000;
const MAX_KEYS = 20_000;

export function makeRateLimiter(opts: { max: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let lastSweep = now();
  return {
    /** Counts one request and says whether it is allowed. A refused request is not counted. */
    hit(key) {
      const t = now();
      if (t - lastSweep >= SWEEP_EVERY_MS) {
        lastSweep = t;
        for (const [k, v] of hits) if (v.every((at) => t - at >= opts.windowMs)) hits.delete(k);
      }
      const recent = (hits.get(key) ?? []).filter((at) => t - at < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return false;
      }
      // Someone inventing endless addresses cannot grow the map for ever: a NEW key is refused while it is full.
      if (recent.length === 0 && !hits.has(key) && hits.size >= MAX_KEYS) return false;
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
  };
}
