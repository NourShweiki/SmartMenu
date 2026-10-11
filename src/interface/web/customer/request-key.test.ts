import { describe, expect, it } from "vitest";
import { lineKey } from "@/domain/cart/cart";
import { forgetRequestKey, newRequestKey, REQUEST_KEY_MAX_AGE_MS, requestKeyFor } from "./request-key";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const A = "44444444-4444-4000-8000-000000000004";
const B = "55555555-5555-4000-8000-000000000005";
/** A cart line as the cart holds it: its key comes from the domain (same item + same choices = same key). */
const line = (menuItemId: string, quantity: number, optionIds: string[] = []) => ({ key: lineKey(menuItemId, optionIds), quantity });

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}
/** Keys "key-1", "key-2", ... so a test can tell a reused key from a new one. */
function counter() {
  let n = 0;
  return () => `key-${++n}`;
}
const T0 = 1_800_000_000_000;

describe("requestKeyFor", () => {
  it("gives a retry of the same cart the same key, also after a reload (the key is stored)", () => {
    const store = memoryStore();
    const next = counter();
    expect(requestKeyFor(store, "demo", [line(A, 2)], T0, next)).toBe("key-1");
    expect(requestKeyFor(store, "demo", [line(A, 2)], T0 + 20_000, next)).toBe("key-1");
    expect(requestKeyFor(store, "demo", [line(A, 2)], T0 + REQUEST_KEY_MAX_AGE_MS - 1, next)).toBe("key-1");
  });

  it("gives a changed cart a new key: another quantity, item, or choice", () => {
    const store = memoryStore();
    const next = counter();
    expect(requestKeyFor(store, "demo", [line(A, 1)], T0, next)).toBe("key-1");
    expect(requestKeyFor(store, "demo", [line(A, 2)], T0, next)).toBe("key-2");
    expect(requestKeyFor(store, "demo", [line(A, 2), line(B, 1)], T0, next)).toBe("key-3");
    expect(requestKeyFor(store, "demo", [line(A, 2, [B])], T0, next)).toBe("key-4");
    // The order the choices were ticked in does not make it a different cart.
    expect(requestKeyFor(store, "demo", [line(A, 1, [A, B])], T0, next)).toBe("key-5");
    expect(requestKeyFor(store, "demo", [line(A, 1, [B, A])], T0, next)).toBe("key-5");
  });

  it("stops reusing a key five minutes after it was last used, so a later identical order is a new order", () => {
    const store = memoryStore();
    const next = counter();
    expect(requestKeyFor(store, "demo", [line(A, 1)], T0, next)).toBe("key-1");
    expect(requestKeyFor(store, "demo", [line(A, 1)], T0 + REQUEST_KEY_MAX_AGE_MS, next)).toBe("key-2");
    // Every retry keeps the key alive: pressing again and again for ten minutes is still one submission.
    const minute = 60_000;
    for (const t of [4, 8, 12]) expect(requestKeyFor(store, "demo", [line(A, 1)], T0 + REQUEST_KEY_MAX_AGE_MS + t * minute, next)).toBe("key-2");
    expect(requestKeyFor(store, "demo", [line(A, 1)], T0 + REQUEST_KEY_MAX_AGE_MS + 17 * minute, next)).toBe("key-3");
    // A clock that went backwards is not trusted either.
    expect(requestKeyFor(store, "demo", [line(A, 1)], T0 - 1, next)).toBe("key-4");
  });

  it("keeps one key per restaurant, and forgets it once the order went through", () => {
    const store = memoryStore();
    const next = counter();
    expect(requestKeyFor(store, "grill", [line(A, 1)], T0, next)).toBe("key-1");
    expect(requestKeyFor(store, "coffee", [line(A, 1)], T0, next)).toBe("key-2");
    expect(requestKeyFor(store, "grill", [line(A, 1)], T0, next)).toBe("key-1");
    forgetRequestKey(store, "grill");
    expect(requestKeyFor(store, "grill", [line(A, 1)], T0, next)).toBe("key-3"); // the same things again = a second round
    expect(requestKeyFor(store, "coffee", [line(A, 1)], T0, next)).toBe("key-2");
  });

  it("still returns a key when storage is missing, broken or holds rubbish", () => {
    const next = counter();
    expect(requestKeyFor(null, "demo", [line(A, 1)], T0, next)).toBe("key-1");
    expect(requestKeyFor(null, "demo", [line(A, 1)], T0, next)).toBe("key-2"); // nothing remembered: a new one each time
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(requestKeyFor(broken, "demo", [line(A, 1)], T0, next)).toBe("key-3");
    expect(() => forgetRequestKey(broken, "demo")).not.toThrow();
    const store = memoryStore();
    for (const rubbish of ["{not json", "null", '"text"', "[]", '{"key":"","cart":"x","at":1}', '{"key":7,"at":"now"}']) {
      store.data.set("smartmenu:order-request:demo", rubbish);
      expect(requestKeyFor(store, "demo", [line(A, 1)], T0, () => "fresh")).toBe("fresh");
    }
  });
});

describe("newRequestKey", () => {
  it("makes a random version-4 UUID, with or without crypto.randomUUID", () => {
    expect(newRequestKey()).toMatch(UUID);
    const original = crypto.randomUUID;
    try {
      // As on a phone that opened the menu over plain http on the restaurant's network.
      (crypto as { randomUUID?: unknown }).randomUUID = undefined;
      const keys = new Set(Array.from({ length: 50 }, () => newRequestKey()));
      expect(keys.size).toBe(50);
      for (const key of keys) expect(key).toMatch(UUID);
    } finally {
      crypto.randomUUID = original;
    }
  });
});
