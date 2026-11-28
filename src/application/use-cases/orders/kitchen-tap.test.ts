import { describe, expect, it } from "vitest";
import type { OrderRepository } from "@/application/ports/order-repository";
import type { SessionAtTable, TableSessionRepository } from "@/application/ports/table-session-repository";
import type { Fils } from "@/domain/shared/money";
import type { Order, OrderId, OrderStatus, TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import type { TableId } from "@/domain/table-session/table-session";
import { makeKitchenTap } from "./kitchen-tap";

// One tap on the kitchen screen = several single steps, each checked like a move on the Orders screen.

const R = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const OTHER = "44444444-4444-4000-8000-000000000004" as RestaurantId;
const PICKUP = "55555555-5555-4000-8000-000000000005" as TableSessionId;
const TABLE = "66666666-6666-4000-8000-000000000006" as TableSessionId;
const ID = "77777777-7777-4000-8000-000000000007" as OrderId;
const NOW = new Date("2026-11-27T09:00:00Z");
const clock = { now: () => NOW };
const actor = (role: Role) => ({ restaurantId: R, role });

function order(status: OrderStatus, sessionId: TableSessionId = PICKUP): Order {
  const zero = 0 as Fils;
  return {
    id: ID,
    restaurantId: R,
    sessionId,
    number: 42,
    status,
    items: [],
    subtotalFils: zero,
    serviceChargeFils: zero,
    taxFils: zero,
    totalFils: zero,
    taxRateBp: 0,
    serviceChargeBp: 0,
    createdAt: new Date(NOW.getTime() - 120_000),
    statusChangedAt: new Date(NOW.getTime() - 60_000),
    cancellation: null,
  };
}

/** A store like the database: a move only happens from the status the order is in; it records every move. */
function store(start: Order, opts: { refuseStep?: OrderStatus } = {}) {
  const state = { order: start, writes: [] as [OrderStatus, OrderStatus][] };
  const orders = {
    findById: async (restaurantId: RestaurantId, orderId: OrderId) => (restaurantId === R && orderId === state.order.id ? state.order : null),
    updateStatus: async (_restaurantId: RestaurantId, _orderId: OrderId, from: OrderStatus, to: OrderStatus) => {
      if (state.order.status !== from || to === opts.refuseStep) return false;
      state.order = { ...state.order, status: to };
      state.writes.push([from, to]);
      return true;
    },
  } as unknown as OrderRepository;
  return { state, orders };
}

const visit = (id: TableSessionId, kind: "PICKUP" | "TABLE", restaurantId = R): SessionAtTable =>
  kind === "PICKUP"
    ? { tableLabel: null, session: { id, restaurantId, kind, tableId: null, customer: { name: "Sara", phone: "+962791234567" }, status: "OPEN", startedAt: NOW, endedAt: null } }
    : { tableLabel: "7", session: { id, restaurantId, kind, tableId: "table-7" as TableId, customer: null, status: "OPEN", startedAt: NOW, endedAt: null } };
const sessionsOf = (...visits: SessionAtTable[]): Pick<TableSessionRepository, "findWithTables"> => ({
  findWithTables: async (_restaurantId, ids) => visits.filter((v) => ids.includes(v.session.id)),
});

function setup(status: OrderStatus, sessionId: TableSessionId = PICKUP, sessions = sessionsOf(visit(PICKUP, "PICKUP"), visit(TABLE, "TABLE")), opts = {}) {
  const world = store(order(status, sessionId), opts);
  return { ...world, tap: makeKitchenTap({ orders: world.orders, sessions, clock }) };
}

describe("kitchen tap", () => {
  it("the counter (cashier) takes a takeout order from new to completed in three taps", async () => {
    const { tap, state } = setup("NEW");
    const start = await tap(actor("CASHIER"), { orderId: ID, tap: "start" });
    expect(start).toMatchObject({ ok: true, value: { moved: ["CONFIRMED", "PREPARING"], complete: true, notifyCustomer: false } });
    const ready = await tap(actor("CASHIER"), { orderId: ID, tap: "ready" });
    expect(ready).toMatchObject({ ok: true, value: { moved: ["READY"], complete: true, notifyCustomer: true } });
    const pickedUp = await tap(actor("CASHIER"), { orderId: ID, tap: "pickedUp" });
    expect(pickedUp).toMatchObject({ ok: true, value: { moved: ["SERVED", "COMPLETED"], complete: true, notifyCustomer: false } });
    expect(pickedUp.ok && pickedUp.value.order.status).toBe("COMPLETED");
    // Every step was its own conditional single-step move, as the database requires.
    expect(state.writes).toEqual([
      ["NEW", "CONFIRMED"],
      ["CONFIRMED", "PREPARING"],
      ["PREPARING", "READY"],
      ["READY", "SERVED"],
      ["SERVED", "COMPLETED"],
    ]);
  });

  it("the new status time is stamped on the order the screen gets back", async () => {
    const { tap } = setup("PREPARING");
    const result = await tap(actor("CASHIER"), { orderId: ID, tap: "ready" });
    expect(result.ok && result.value.order.statusChangedAt).toEqual(NOW);
  });

  it("a button the order does not offer any more changes nothing (screen out of date): CONFLICT", async () => {
    const { tap, state } = setup("PREPARING");
    expect(await tap(actor("CASHIER"), { orderId: ID, tap: "start" })).toEqual({ ok: false, error: { type: "CONFLICT" } });
    expect(state.writes).toEqual([]);
  });

  it("someone else moved the order between two steps: the first step stays, the result says it is not complete", async () => {
    const { tap, state } = setup("NEW", PICKUP, undefined, { refuseStep: "PREPARING" });
    const result = await tap(actor("CASHIER"), { orderId: ID, tap: "start" });
    expect(result).toMatchObject({ ok: true, value: { moved: ["CONFIRMED"], complete: false } });
    expect(state.order.status).toBe("CONFIRMED"); // still in the "new" column: the next Start carries on
  });

  it("nothing could be moved at all: CONFLICT", async () => {
    const { tap } = setup("NEW", PICKUP, undefined, { refuseStep: "CONFIRMED" });
    expect(await tap(actor("CASHIER"), { orderId: ID, tap: "start" })).toEqual({ ok: false, error: { type: "CONFLICT" } });
  });

  it("the waiter's Picked up hands a takeout order over and leaves completing to the cashier", async () => {
    const { tap } = setup("READY");
    expect(await tap(actor("WAITER"), { orderId: ID, tap: "pickedUp" })).toMatchObject({ ok: true, value: { moved: ["SERVED"], complete: true } });
  });

  it("at a table Picked up only serves, even for the owner (completing follows payment)", async () => {
    const { tap } = setup("READY", TABLE);
    expect(await tap(actor("OWNER"), { orderId: ID, tap: "pickedUp" })).toMatchObject({ ok: true, value: { moved: ["SERVED"] } });
  });

  it("the cashier may not move a table order, nor one whose visit cannot be read or is another restaurant's", async () => {
    const forbidden = { ok: false, error: { type: "FORBIDDEN" } };
    expect(await setup("NEW", TABLE).tap(actor("CASHIER"), { orderId: ID, tap: "start" })).toEqual(forbidden);
    expect(await setup("NEW", PICKUP, sessionsOf()).tap(actor("CASHIER"), { orderId: ID, tap: "start" })).toEqual(forbidden);
    expect(await setup("NEW", PICKUP, sessionsOf(visit(PICKUP, "PICKUP", OTHER))).tap(actor("CASHIER"), { orderId: ID, tap: "start" })).toEqual(forbidden);
  });

  it("finished orders have no button: FORBIDDEN", async () => {
    for (const status of ["COMPLETED", "CANCELLED"] as const) {
      expect(await setup(status).tap(actor("OWNER"), { orderId: ID, tap: "pickedUp" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    }
  });

  it("an unknown order, or one of another restaurant: ORDER_NOT_FOUND", async () => {
    const { tap } = setup("NEW");
    expect(await tap(actor("CASHIER"), { orderId: "88888888-8888-4000-8000-000000000008" as OrderId, tap: "start" })).toEqual({ ok: false, error: { type: "ORDER_NOT_FOUND" } });
    expect(await tap({ restaurantId: OTHER, role: "OWNER" }, { orderId: ID, tap: "start" })).toEqual({ ok: false, error: { type: "ORDER_NOT_FOUND" } });
  });
});
