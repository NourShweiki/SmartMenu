import { describe, expect, it } from "vitest";
import { makeRateLimiter } from "./rate-limit";

describe("makeRateLimiter", () => {
  it("allows `max` hits per window per key, then refuses until the window moves on", () => {
    let now = 0;
    const limiter = makeRateLimiter({ max: 2, windowMs: 1000, now: () => now });
    expect([limiter.hit("a"), limiter.hit("a"), limiter.hit("a")]).toEqual([true, true, false]);
    expect(limiter.hit("b")).toBe(true); // another key has its own count
    now = 999;
    expect(limiter.hit("a")).toBe(false);
    now = 1000; // the first hit has left the window
    expect(limiter.hit("a")).toBe(true);
  });

  it("never holds more than a fixed number of keys: new keys are refused while it is full, known ones keep working", () => {
    let now = 0;
    const limiter = makeRateLimiter({ max: 5, windowMs: 60_000, now: () => now });
    for (let i = 0; i < 20_000; i++) expect(limiter.hit(`k${i}`)).toBe(true);
    expect(limiter.hit("one-too-many")).toBe(false);
    expect(limiter.hit("k0")).toBe(true); // already known
    now = 120_000; // everything has aged out: the next sweep makes room again
    expect(limiter.hit("one-too-many")).toBe(true);
  });

  it("does not count refused requests (a hammering client is not locked out longer)", () => {
    let now = 0;
    const limiter = makeRateLimiter({ max: 1, windowMs: 1000, now: () => now });
    limiter.hit("a");
    for (now = 100; now < 900; now += 100) limiter.hit("a");
    now = 1000;
    expect(limiter.hit("a")).toBe(true);
  });
});
