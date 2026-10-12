import { describe, expect, it } from "vitest";
import { PickupLimitReached, type OrderRepository } from "@/application/ports/order-repository";
import type { CatalogEntry, OrderingCatalog } from "@/application/ports/ordering-catalog";
import type { SessionAtTable, TableSessionRepository } from "@/application/ports/table-session-repository";
import { createCategory, createMenuItem } from "@/domain/menu/menu";
import type { Order, OrderId, OrderStatus, TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import type { PickupCustomer } from "@/domain/table-session/pickup";
import type { TableId } from "@/domain/table-session/table-session";
import { makeGetOpenVisits } from "../tables/get-open-visits";
import { makeMoveTableSession } from "../tables/move-table-session";
import { makeCancelOrder } from "./cancel-order";
import { makeGetStaffOrderList } from "./get-staff-order-list";
import { makeMoveOrderStatus } from "./move-order-status";
import { makePlaceOrder, makePlacePickupOrder } from "./place-order";

// Takeout: an order that starts its own pickup visit, and what staff may do with it.

const R = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const KEY = "99999999-9999-4000-8000-0000000000AA";
const VISIT = KEY.toLowerCase() as TableSessionId; // the submission key becomes the visit's id
const NOW = new Date("2026-10-12T12:00:00Z");
const clock = { now: () => NOW };
const RATES = { taxRateBp: 1600, serviceChargeBp: 1000 };
const ALI: PickupCustomer = { name: "Ali Hasan", phone: "+962791234567" };

let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

function shop() {
  const category = unwrap(createCategory(R, { name: { en: "Coffee", ar: "قهوة" }, sortOrder: 0 }, ids));
  const coffee = unwrap(createMenuItem(category, { name: { en: "Arabic coffee", ar: "قهوة عربية" }, description: { en: "", ar: "" }, priceFils: 2500, sortOrder: 0 }, ids));
  const entry: CatalogEntry = { item: coffee, category, groups: [] };
  const catalog: OrderingCatalog = { findEntries: async (restaurantId, itemIds) => (restaurantId === R && itemIds.includes(coffee.id) ? [entry] : []) };

  const state = { orders: [] as Order[], keys: new Map<string, string>(), started: [] as { sessionId: string; customer: PickupCustomer; clientHash?: string | null }[], next: 0, limit: null as "PHONE" | "DEVICE" | "RESTAURANT" | null };
  const byKey = (sessionId: string, requestId: string) => state.orders.find((o) => o.sessionId === sessionId && state.keys.get(o.id) === requestId);
  const orders: OrderRepository = {
    nextNumber: async () => ++state.next,
    // Like the database function: with a customer it starts the visit, unless that visit is already there.
    place: async (order, requestId, pickup) => {
      const earlier = requestId ? byKey(order.sessionId, requestId) : undefined;
      if (earlier) return earlier.id;
      if (pickup && !state.started.some((s) => s.sessionId === order.sessionId)) {
        if (state.limit) throw new PickupLimitReached(state.limit); // the store's limits on a NEW visit
        const { clientHash, ...customer } = pickup;
        state.started.push({ sessionId: order.sessionId, customer, clientHash });
      }
      state.orders.push(order);
      if (requestId) state.keys.set(order.id, requestId);
      return order.id;
    },
    findByRequest: async (_restaurantId, sessionId, requestId) => byKey(sessionId, requestId) ?? null,
    findById: async (_restaurantId, orderId) => state.orders.find((o) => o.id === orderId) ?? null,
    listOpen: async () => state.orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED"),
    listBySession: async (_restaurantId, sessionId) => state.orders.filter((o) => o.sessionId === sessionId),
    listBySessions: async (_restaurantId, sessionIds) => state.orders.filter((o) => sessionIds.includes(o.sessionId)),
    updateStatus: async (_restaurantId, orderId, from, to) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order || order.status !== from) return false;
      state.orders[state.orders.indexOf(order)] = { ...order, status: to };
      return true;
    },
    cancel: async (_restaurantId, orderId, from, reason) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order || order.status !== from) return false;
      state.orders[state.orders.indexOf(order)] = { ...order, status: "CANCELLED", cancellation: { reason, at: NOW, by: "staff" } };
      return true;
    },
  };
  const cart = [{ menuItemId: coffee.id, quantity: 1, selectedOptionIds: [] }];
  return { deps: { orders, catalog, ids, clock }, state, cart };
}

const pickupVisit = (id: TableSessionId, customer = ALI): SessionAtTable => ({
  tableLabel: null,
  session: { id, restaurantId: R, kind: "PICKUP", tableId: null, customer, status: "OPEN", startedAt: new Date(NOW.getTime() - 5 * 60_000), endedAt: null },
});
const tableVisit = (id: TableSessionId, label: string): SessionAtTable => ({
  tableLabel: label,
  session: { id, restaurantId: R, kind: "TABLE", tableId: `table-${label}` as TableId, customer: null, status: "OPEN", startedAt: new Date(NOW.getTime() - 5 * 60_000), endedAt: null },
});
const sessionsOf = (visits: SessionAtTable[]): TableSessionRepository => ({
  findWithTables: async (_restaurantId, sessionIds) => visits.filter((v) => sessionIds.includes(v.session.id)),
  listLive: async () => visits, // a careless store that hands pickup visits out too
  updateStatus: async () => true,
});
const actor = (role: Role) => ({ restaurantId: R, role });

describe("placing a takeout (pickup) order", () => {
  it("starts a pickup visit with the order: tidied customer, the submission key as its id, no service charge", async () => {
    const { deps, state, cart } = shop();
    const result = unwrap(await makePlacePickupOrder(deps)({ restaurantId: R, rates: RATES, lines: cart, requestId: KEY, customer: { name: "  Ali   Hasan ", phone: "079 123 4567" } }));

    expect(result.customer).toEqual(ALI);
    expect(result.order).toMatchObject({ sessionId: VISIT, number: 1, status: "NEW", serviceChargeBp: 0, serviceChargeFils: 0, taxRateBp: 1600, subtotalFils: 2500, taxFils: 400, totalFils: 2900 });
    expect(state.started).toEqual([{ sessionId: VISIT, customer: ALI, clientHash: null }]);
  });

  it("is safe to send twice: the same key returns the first order and starts nothing new", async () => {
    const { deps, state, cart } = shop();
    const input = { restaurantId: R, rates: RATES, lines: cart, requestId: KEY, customer: { name: "Ali Hasan", phone: "0791234567" } };
    const first = unwrap(await makePlacePickupOrder(deps)(input));
    const again = unwrap(await makePlacePickupOrder(deps)(input));
    expect(again.order.id).toBe(first.order.id);
    expect(state.orders).toHaveLength(1);
    expect(state.started).toHaveLength(1);
    expect(state.next).toBe(1); // no order number was used up
  });

  it("refuses a bad name, a number that is not a Jordanian mobile, and a missing key, before anything is stored", async () => {
    const { deps, state, cart } = shop();
    const place = makePlacePickupOrder(deps);
    const base = { restaurantId: R, rates: RATES, lines: cart, requestId: KEY };
    expect(await place({ ...base, customer: { name: "  ", phone: "0791234567" } })).toEqual({ ok: false, error: { type: "NAME_REQUIRED" } });
    expect(await place({ ...base, customer: { name: "Ali", phone: "064123456" } })).toEqual({ ok: false, error: { type: "PHONE_INVALID" } });
    expect(await place({ ...base, requestId: "not-a-key", customer: { name: "Ali", phone: "0791234567" } })).toEqual({ ok: false, error: { type: "INVALID_REQUEST" } });
    expect(await place({ ...base, lines: [], customer: { name: "Ali", phone: "0791234567" } })).toEqual({ ok: false, error: { type: "EMPTY_ORDER" } });
    expect(state.orders).toEqual([]);
    expect(state.started).toEqual([]);
  });

  it("ordering again into the open pickup visit carries no service charge either, and starts no second visit", async () => {
    const { deps, state, cart } = shop();
    unwrap(await makePlacePickupOrder(deps)({ restaurantId: R, rates: RATES, lines: cart, requestId: KEY, customer: { name: "Ali Hasan", phone: "0791234567" } }));
    const more = unwrap(await makePlaceOrder(deps)({ restaurantId: R, sessionId: VISIT, kind: "PICKUP", rates: RATES, lines: cart, requestId: "88888888-8888-4000-8000-000000000001" }));
    expect(more).toMatchObject({ sessionId: VISIT, number: 2, serviceChargeFils: 0, totalFils: 2900 });
    expect(state.started).toHaveLength(1);
    // The same cart at a TABLE keeps the service charge: 2.500 + 0.250 + 0.440.
    const atTable = unwrap(await makePlaceOrder(deps)({ restaurantId: R, sessionId: "33333333-3333-4000-8000-000000000003" as TableSessionId, kind: "TABLE", rates: RATES, lines: cart }));
    expect(atTable).toMatchObject({ serviceChargeFils: 250, totalFils: 3190 });
  });
});

describe("limits on takeout orders", () => {
  it("answers with the limit that was reached, having stored nothing, and passes the device's fingerprint on", async () => {
    const { deps, state, cart } = shop();
    const input = { restaurantId: R, rates: RATES, lines: cart, requestId: KEY, customer: { name: "Ali Hasan", phone: "0791234567" }, clientHash: "f".repeat(64) };
    for (const limit of ["PHONE", "DEVICE", "RESTAURANT"] as const) {
      state.limit = limit;
      expect(await makePlacePickupOrder(deps)(input)).toEqual({ ok: false, error: { type: "PICKUP_LIMIT", limit } });
    }
    expect(state.orders).toEqual([]);
    state.limit = null;
    unwrap(await makePlacePickupOrder(deps)(input));
    expect(state.started[0]?.clientHash).toBe("f".repeat(64));
  });
});

describe("staff and a pickup order", () => {
  async function placed(status: OrderStatus = "NEW") {
    const world = shop();
    const { order } = unwrap(await makePlacePickupOrder(world.deps)({ restaurantId: R, rates: RATES, lines: world.cart, requestId: KEY, customer: { name: "Ali Hasan", phone: "0791234567" } }));
    world.state.orders[0] = { ...order, status };
    return { ...world, id: order.id as OrderId, sessions: sessionsOf([pickupVisit(VISIT), tableVisit("33333333-3333-4000-8000-000000000003" as TableSessionId, "7")]) };
  }

  it("shows in the queue with the customer instead of a table", async () => {
    const { deps, sessions } = await placed();
    const [entry] = await makeGetStaffOrderList({ orders: deps.orders, sessions, clock })(actor("WAITER"));
    expect(entry?.table).toEqual({ sessionId: VISIT, kind: "PICKUP", label: null, customer: ALI, sessionStatus: "OPEN" });
  });

  it("the cashier takes it through every step", async () => {
    const { deps, sessions, id } = await placed();
    const move = makeMoveOrderStatus({ orders: deps.orders, sessions, clock });
    for (const to of ["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"] as const) {
      expect(unwrap(await move(actor("CASHIER"), { orderId: id, to })).order.status).toBe(to);
    }
  });

  it("the waiter moves it up to served and cannot complete it, as at a table", async () => {
    const { deps, sessions, id } = await placed("READY");
    const move = makeMoveOrderStatus({ orders: deps.orders, sessions, clock });
    expect((await move(actor("WAITER"), { orderId: id, to: "SERVED" })).ok).toBe(true);
    expect(await move(actor("WAITER"), { orderId: id, to: "COMPLETED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
  });

  it("the cashier still cannot confirm an order at a table, or one whose visit cannot be read", async () => {
    const world = shop();
    const TABLE = "33333333-3333-4000-8000-000000000003" as TableSessionId;
    const order = unwrap(await makePlaceOrder(world.deps)({ restaurantId: R, sessionId: TABLE, kind: "TABLE", rates: RATES, lines: world.cart }));
    const refused = { ok: false, error: { type: "FORBIDDEN" } };
    expect(await makeMoveOrderStatus({ orders: world.deps.orders, sessions: sessionsOf([tableVisit(TABLE, "7")]), clock })(actor("CASHIER"), { orderId: order.id, to: "CONFIRMED" })).toEqual(refused);
    expect(await makeMoveOrderStatus({ orders: world.deps.orders, sessions: sessionsOf([]), clock })(actor("CASHIER"), { orderId: order.id, to: "CONFIRMED" })).toEqual(refused);
  });

  it("the cashier cancels a takeout order nobody collected, at any step; never an order at a table", async () => {
    for (const status of ["NEW", "PREPARING", "READY", "SERVED"] as const) {
      const { deps, sessions, id } = await placed(status);
      const result = await makeCancelOrder({ orders: deps.orders, sessions, clock })(actor("CASHIER"), { orderId: id, reason: "NOT_COLLECTED" });
      expect(result.ok && result.value.status).toBe("CANCELLED");
    }
    const world = shop();
    const TABLE = "33333333-3333-4000-8000-000000000003" as TableSessionId;
    const order = unwrap(await makePlaceOrder(world.deps)({ restaurantId: R, sessionId: TABLE, kind: "TABLE", rates: RATES, lines: world.cart }));
    expect(await makeCancelOrder({ orders: world.deps.orders, sessions: sessionsOf([tableVisit(TABLE, "7")]), clock })(actor("CASHIER"), { orderId: order.id, reason: "NOT_COLLECTED" })).toEqual({
      ok: false,
      error: { type: "FORBIDDEN" },
    });
  });

  it("a pickup visit is not a table: it is not on the open tables list and staff cannot move it", async () => {
    const { deps, sessions } = await placed();
    const visits = await makeGetOpenVisits({ sessions, orders: deps.orders, clock })(actor("CASHIER"));
    expect(visits.map((v) => v.tableLabel)).toEqual(["7"]);
    for (const to of ["PAYMENT_REQUESTED", "CLOSED"] as const) {
      expect(await makeMoveTableSession({ sessions, orders: deps.orders, clock })(actor("OWNER"), { sessionId: VISIT, to })).toEqual({ ok: false, error: { type: "SESSION_NOT_FOUND" } });
    }
  });
});
