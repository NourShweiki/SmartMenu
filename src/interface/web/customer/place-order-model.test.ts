import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import type { PublicSession } from "@/application/ports/table-session-gateway";
import type { PlaceOrderInput } from "@/application/use-cases/orders/place-order";
import type { OrderUseCaseError } from "@/application/use-cases/orders/shared";
import type { Order } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok } from "@/domain/shared/result";
import type { SessionStatus, TableSessionId } from "@/domain/table-session/table-session";
import { orderProblem, placeCustomerOrder, readCartLines, readRequestId } from "./place-order-model";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const SESSION = "33333333-3333-4000-8000-000000000003" as TableSessionId;
const ITEM = "44444444-4444-4000-8000-000000000004";
const OPTION = "55555555-5555-4000-8000-000000000005";

const restaurant = (dineInEnabled = true) =>
  ({
    id: R,
    slug: "demo-dinein",
    name: { en: "Demo Grill", ar: "مشاوي" },
    settings: { dineInEnabled, takeoutEnabled: true, deliveryEnabled: false, taxRateBp: 1600, serviceChargeBp: 1000, defaultLanguage: "ar" },
    branding: {},
  }) as unknown as PublicRestaurant;

const KEY = "66666666-6666-4000-8000-000000000006";
const CART = { lines: [{ key: "ignored", menuItemId: ITEM, optionIds: [OPTION], quantity: 2 }], requestId: KEY };

/** Fake ports: a session whose status can change between calls, and a use case that records what it was asked. */
function setup(
  options: {
    statuses?: (SessionStatus | null)[];
    place?: () => Promise<ReturnType<typeof ok<Order>> | ReturnType<typeof err<OrderUseCaseError>>>;
    /** Number of the order this submission already produced (its reply was lost), if it did. */
    alreadyPlaced?: number;
  } = {},
) {
  const statuses = [...(options.statuses ?? ["OPEN"])];
  const seen = { finds: [] as { slug: string; sessionId: string }[], placed: [] as PlaceOrderInput[], lookups: [] as unknown[] };
  const deps = {
    findSession: async (input: { slug: string; sessionId: string }): Promise<PublicSession | null> => {
      seen.finds.push(input);
      const status = statuses.length > 1 ? statuses.shift()! : statuses[0]!;
      return status ? { sessionId: SESSION, kind: "TABLE" as const, tableLabel: "7", status } : null;
    },
    place: async (input: PlaceOrderInput) => {
      seen.placed.push(input);
      return options.place ? options.place() : ok({ number: 42 } as Order);
    },
    findPlaced: async (input: { restaurantId: string; sessionId: string; requestId: string }) => {
      seen.lookups.push(input);
      return options.alreadyPlaced === undefined ? null : ({ number: options.alreadyPlaced } as Order);
    },
  };
  return { deps, seen };
}

afterEach(() => vi.restoreAllMocks());

describe("readCartLines", () => {
  it("keeps ids and quantities only", () => {
    expect(readCartLines(CART)).toEqual([{ menuItemId: ITEM, quantity: 2, selectedOptionIds: [OPTION] }]);
    expect(readCartLines({ lines: [] })).toEqual([]);
  });

  it("refuses the whole cart when anything is odd (never drops a line silently)", () => {
    const good = CART.lines[0]!;
    for (const cart of [
      null,
      "x",
      {},
      { lines: "x" },
      { lines: [good, null] },
      { lines: [{ ...good, menuItemId: "1 or 1=1" }] },
      { lines: [{ ...good, optionIds: ["nope"] }] },
      { lines: [{ ...good, optionIds: "x" }] },
      { lines: [{ ...good, quantity: "2" }] },
      { lines: [{ ...good, quantity: 0 }] },
      { lines: [{ ...good, quantity: -1 }] },
      { lines: [{ ...good, quantity: 1.5 }] },
      { lines: [{ ...good, quantity: Number.NaN }] },
      { lines: Array.from({ length: 101 }, () => good) },
      { lines: [{ ...good, optionIds: Array.from({ length: 101 }, () => OPTION) }] },
    ]) {
      expect(readCartLines(cart)).toBeNull();
    }
  });
});

describe("readRequestId", () => {
  it("accepts a UUID and nothing else", () => {
    expect(readRequestId(CART)).toBe(KEY);
    for (const cart of [null, "x", {}, { requestId: "" }, { requestId: 7 }, { requestId: "1 or 1=1" }, { requestId: [KEY] }]) {
      expect(readRequestId(cart)).toBeNull();
    }
  });
});

describe("orderProblem", () => {
  it("maps every use-case failure to what the cart shows", () => {
    expect(orderProblem({ type: "EMPTY_ORDER" })).toBe("empty");
    expect(orderProblem({ type: "TOO_MANY_LINES", max: 50 })).toBe("tooLarge");
    expect(orderProblem({ type: "ORDER_TOO_LARGE" })).toBe("tooLarge");
    expect(orderProblem({ type: "INVALID_QUANTITY", menuItemId: ITEM })).toBe("tooLarge");
    expect(orderProblem({ type: "ITEM_NOT_FOUND", menuItemId: ITEM })).toBe("itemsChanged");
    expect(orderProblem({ type: "ITEM_NOT_ORDERABLE", menuItemId: ITEM })).toBe("itemsChanged");
    expect(orderProblem({ type: "SELECTION", menuItemId: ITEM, reason: { type: "TOO_FEW", min: 1 } as never })).toBe("itemsChanged");
    expect(orderProblem({ type: "INVALID_RATES" })).toBe("failed");
    expect(orderProblem({ type: "WRONG_RESTAURANT" })).toBe("failed");
    expect(orderProblem({ type: "CONFLICT" })).toBe("failed");
  });
});

describe("placeCustomerOrder", () => {
  it("places the order with the server's restaurant, session and rates, and returns its number", async () => {
    const { deps, seen } = setup();
    const outcome = await placeCustomerOrder(deps, { restaurant: restaurant(), sessionId: SESSION, cart: CART });
    expect(outcome).toEqual({ ok: true, orderNumber: 42 });
    expect(seen.finds).toEqual([{ slug: "demo-dinein", sessionId: SESSION }]);
    expect(seen.placed).toEqual([
      {
        restaurantId: R,
        sessionId: SESSION,
        kind: "TABLE",
        rates: { taxRateBp: 1600, serviceChargeBp: 1000 },
        lines: [{ menuItemId: ITEM, quantity: 2, selectedOptionIds: [OPTION] }],
        requestId: KEY,
      },
    ]);
  });

  it("ignores a restaurant, session, price or rate smuggled into the cart", async () => {
    const { deps, seen } = setup();
    const cart = {
      restaurantId: "99999999-9999-4000-8000-000000000009",
      sessionId: "99999999-9999-4000-8000-000000000009",
      rates: { taxRateBp: 0, serviceChargeBp: 0 },
      lines: [{ ...CART.lines[0], priceFils: 1, unitPriceFils: 1 }],
      requestId: KEY,
    };
    await placeCustomerOrder(deps, { restaurant: restaurant(), sessionId: SESSION, cart });
    expect(seen.placed[0]).toEqual({
      restaurantId: R,
      sessionId: SESSION,
      kind: "TABLE",
      rates: { taxRateBp: 1600, serviceChargeBp: 1000 },
      lines: [{ menuItemId: ITEM, quantity: 2, selectedOptionIds: [OPTION] }],
      requestId: KEY,
    });
  });

  it("refuses before touching the database: dine-in off, no table, bad or empty cart, no submission key", async () => {
    const cases = [
      [{ restaurant: restaurant(false), sessionId: SESSION, cart: CART }, "orderingOff"],
      [{ restaurant: restaurant(), sessionId: null, cart: CART }, "noTable"],
      [{ restaurant: restaurant(), sessionId: SESSION, cart: { lines: "x" } }, "failed"],
      [{ restaurant: restaurant(), sessionId: SESSION, cart: { lines: [], requestId: KEY } }, "empty"],
      [{ restaurant: restaurant(), sessionId: SESSION, cart: { lines: CART.lines } }, "failed"],
      [{ restaurant: restaurant(), sessionId: SESSION, cart: { lines: CART.lines, requestId: "again" } }, "failed"],
    ] as const;
    for (const [input, problem] of cases) {
      const { deps, seen } = setup();
      expect(await placeCustomerOrder(deps, input)).toEqual({ ok: false, problem });
      expect(seen.finds).toHaveLength(0);
      expect(seen.placed).toHaveLength(0);
    }
  });

  it("refuses a session that is unknown, closed (or timed out), or waiting for the bill", async () => {
    const cases = [
      [null, "noTable"],
      ["CLOSED", "sessionEnded"],
      ["PAYMENT_REQUESTED", "paymentRequested"],
    ] as const;
    for (const [status, problem] of cases) {
      const { deps, seen } = setup({ statuses: [status] });
      expect(await placeCustomerOrder(deps, { restaurant: restaurant(), sessionId: SESSION, cart: CART })).toEqual({ ok: false, problem });
      expect(seen.placed).toHaveLength(0);
    }
  });

  it("answers a retry with its order even after the visit stopped taking orders, instead of 'scan again'", async () => {
    for (const status of ["CLOSED", "PAYMENT_REQUESTED"] as const) {
      const { deps, seen } = setup({ statuses: [status], alreadyPlaced: 17 });
      expect(await placeCustomerOrder(deps, { restaurant: restaurant(), sessionId: SESSION, cart: CART })).toEqual({ ok: true, orderNumber: 17 });
      expect(seen.lookups).toEqual([{ restaurantId: R, sessionId: SESSION, requestId: KEY }]); // this key, this table, this restaurant
      expect(seen.placed).toHaveLength(0); // nothing new is placed in a visit that takes no orders
    }
    // While the visit is open the use case does the lookup itself: no extra question here.
    const open = setup({ alreadyPlaced: 17 });
    await placeCustomerOrder(open.deps, { restaurant: restaurant(), sessionId: SESSION, cart: CART });
    expect(open.seen.lookups).toHaveLength(0);
  });

  it("passes on the use case's refusal, and logs one that no guest can cause", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = { restaurant: restaurant(), sessionId: SESSION, cart: CART };
    const sold = setup({ place: async () => err({ type: "ITEM_NOT_ORDERABLE", menuItemId: ITEM }) });
    expect(await placeCustomerOrder(sold.deps, input)).toEqual({ ok: false, problem: "itemsChanged" });
    expect(log).not.toHaveBeenCalled();
    const rates = setup({ place: async () => err({ type: "INVALID_RATES" }) });
    expect(await placeCustomerOrder(rates.deps, input)).toEqual({ ok: false, problem: "failed" });
    expect(log).toHaveBeenCalledOnce();
  });

  it("says the visit ended when the database refuses because it closed in the meantime", async () => {
    const boom = async () => {
      throw new Error("place_order failed: orders can only be placed in an OPEN, unexpired table session");
    };
    const { deps } = setup({ statuses: ["OPEN", "PAYMENT_REQUESTED"], place: boom });
    expect(await placeCustomerOrder(deps, { restaurant: restaurant(), sessionId: SESSION, cart: CART })).toEqual({ ok: false, problem: "paymentRequested" });
  });

  it("logs an unexpected failure and shows the generic message, without leaking the cause", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = setup({
      place: async () => {
        throw new Error("connection refused");
      },
    });
    expect(await placeCustomerOrder(deps, { restaurant: restaurant(), sessionId: SESSION, cart: CART })).toEqual({ ok: false, problem: "failed" });
    expect(log).toHaveBeenCalledOnce();
  });
});
