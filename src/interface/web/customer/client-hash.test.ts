import { beforeEach, describe, expect, it, vi } from "vitest";

// The device fingerprint behind the takeout limit "one device may start 3 takeout orders in 10 minutes"
// (PROJECT_SPEC.md §4 Takeout design): a salted hash of the network address, NEVER the address itself.
const fake = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => fake.headers }));

const { clientHashFor, signInVisitorHash } = await import("./client-hash");

const GRILL = "11111111-1111-4000-8000-000000000001";
const COFFEE = "22222222-2222-4000-8000-000000000002";

function from(headers: Record<string, string>) {
  fake.headers = new Headers(headers);
}

beforeEach(() => from({}));

describe("clientHashFor", () => {
  it("is a SHA-256 hex digest that does not contain the address", async () => {
    from({ "x-forwarded-for": "203.0.113.7" });
    const hash = await clientHashFor(GRILL);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
  });

  it("is stable for the same device at the same restaurant", async () => {
    from({ "x-forwarded-for": "203.0.113.7" });
    expect(await clientHashFor(GRILL)).toBe(await clientHashFor(GRILL));
  });

  it("differs per restaurant, so one restaurant's data cannot follow a visitor to another", async () => {
    from({ "x-forwarded-for": "203.0.113.7" });
    expect(await clientHashFor(GRILL)).not.toBe(await clientHashFor(COFFEE));
  });

  it("differs per device", async () => {
    from({ "x-forwarded-for": "203.0.113.7" });
    const first = await clientHashFor(GRILL);
    from({ "x-forwarded-for": "203.0.113.8" });
    expect(await clientHashFor(GRILL)).not.toBe(first);
  });

  it("uses the first address of x-forwarded-for (the visitor), not the proxies after it", async () => {
    from({ "x-forwarded-for": "203.0.113.7" });
    const visitor = await clientHashFor(GRILL);
    from({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(await clientHashFor(GRILL)).toBe(visitor);
  });

  it("falls back to x-real-ip", async () => {
    from({ "x-forwarded-for": "203.0.113.7" });
    const viaForwarded = await clientHashFor(GRILL);
    from({ "x-real-ip": "203.0.113.7" });
    expect(await clientHashFor(GRILL)).toBe(viaForwarded);
  });

  it("is null (limit not applied) when the address is unknown or is the machine itself", async () => {
    for (const address of ["", "127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]) {
      from(address ? { "x-forwarded-for": address } : {});
      expect(await clientHashFor(GRILL), address || "(no header)").toBeNull();
    }
  });
});

describe("signInVisitorHash", () => {
  it("is one fingerprint per visitor for sign-in, different from any restaurant's takeout fingerprint", async () => {
    from({ "x-forwarded-for": "203.0.113.7" });
    const hash = await signInVisitorHash();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await signInVisitorHash()).toBe(hash);
    expect(hash).not.toBe(await clientHashFor(GRILL));
  });

  it("is null for an unknown or local address (then only the per-account limit applies)", async () => {
    from({ "x-forwarded-for": "127.0.0.1" });
    expect(await signInVisitorHash()).toBeNull();
  });
});
