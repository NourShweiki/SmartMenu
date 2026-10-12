import { describe, expect, it } from "vitest";
import type { OrderRepository } from "@/application/ports/order-repository";
import type { CatalogEntry, OrderingCatalog } from "@/application/ports/ordering-catalog";
import {
  createCategory,
  createMenuItem,
  setItemSoldOut,
  type MenuCategory,
  type MenuItem,
} from "@/domain/menu/menu";
import { createOption, createOptionGroup, type MenuOption, type OptionGroup } from "@/domain/menu/options";
import { ORDER_FLOW, type Order, type OrderId, type OrderStatus, type TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import type { SessionAtTable, TableSessionRepository } from "@/application/ports/table-session-repository";
import type { TableId } from "@/domain/table-session/table-session";
import { makeCancelOrder } from "./cancel-order";
import { makeGetStaffOrderList } from "./get-staff-order-list";
import { makeMoveOrderStatus } from "./move-order-status";
import { makeFindPlacedOrder, makePlaceOrder } from "./place-order";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const OTHER = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const SESSION = "33333333-3333-4000-8000-000000000003" as TableSessionId;
const RATES = { taxRateBp: 1600, serviceChargeBp: 1000 };
const NOW = new Date("2026-10-10T12:00:00Z");
/** The time the (fake) database stamps on a cancellation: not the app's clock, on purpose. */
const STAMP = new Date("2026-10-10T12:00:05Z");

let n = 0;
const domainIds = { newId: () => `id-${++n}` };
const clock = { now: () => NOW };
/** No visit can be read: an order then counts as a table order (the stricter rule). */
const noVisits: Pick<TableSessionRepository, "findWithTables"> = { findWithTables: async () => [] };

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

// ─── Fakes ──────────────────────────────────────────────────────────────

function fakeOrders(initial: Order[] = []) {
  const state = {
    orders: [...initial],
    counters: new Map<string, number>(),
    placed: 0,
    statusWrites: 0,
    refuseStatus: false,
    /** Request key each stored order was placed with. */
    keys: new Map<string, string>(),
    /** Pretend the key is not there yet when asked: the moment before a parallel submission is stored. */
    hideKeys: false,
  };
  const byKey = (restaurantId: string, sessionId: string, requestId: string) =>
    state.orders.find((o) => o.restaurantId === restaurantId && o.sessionId === sessionId && state.keys.get(o.id) === requestId);
  const repo: OrderRepository = {
    nextNumber: async (restaurantId) => {
      const next = (state.counters.get(restaurantId) ?? 0) + 1;
      state.counters.set(restaurantId, next);
      return next;
    },
    // Like the database function: a key already used in the session stores nothing and names the earlier order.
    place: async (order, requestId) => {
      const earlier = requestId ? byKey(order.restaurantId, order.sessionId, requestId) : undefined;
      if (earlier) return earlier.id;
      state.placed++;
      state.orders.push(order);
      if (requestId) state.keys.set(order.id, requestId);
      return order.id;
    },
    findByRequest: async (restaurantId, sessionId, requestId) =>
      state.hideKeys ? null : (byKey(restaurantId, sessionId, requestId) ?? null),
    findById: async (restaurantId, orderId) => state.orders.find((o) => o.restaurantId === restaurantId && o.id === orderId) ?? null,
    listOpen: async (restaurantId) =>
      state.orders.filter((o) => o.restaurantId === restaurantId && o.status !== "COMPLETED" && o.status !== "CANCELLED"),
    // Like the database: only if the order is still in `from`; it stamps the time and (here) nobody in particular.
    cancel: async (restaurantId, orderId, from, reason) => {
      const order = state.orders.find((o) => o.restaurantId === restaurantId && o.id === orderId);
      if (state.refuseStatus || !order || order.status !== from) return false;
      state.orders[state.orders.indexOf(order)] = { ...order, status: "CANCELLED", cancellation: { reason, at: STAMP, by: "staff-user" } };
      return true;
    },
    listBySession: async (restaurantId, sessionId) =>
      state.orders.filter((o) => o.restaurantId === restaurantId && o.sessionId === sessionId),
    listBySessions: async (restaurantId, sessionIds) =>
      state.orders.filter((o) => o.restaurantId === restaurantId && sessionIds.includes(o.sessionId)),
    updateStatus: async (restaurantId, orderId, from, to) => {
      state.statusWrites++;
      const order = state.orders.find((o) => o.restaurantId === restaurantId && o.id === orderId);
      if (state.refuseStatus || !order || order.status !== from) return false;
      state.orders[state.orders.indexOf(order)] = { ...order, status: to };
      return true;
    },
  };
  return { repo, state };
}

function menu(restaurantId: RestaurantId) {
  const category: MenuCategory = unwrap(createCategory(restaurantId, { name: { en: "Grill", ar: "مشاوي" }, sortOrder: 0 }, domainIds));
  const kebab: MenuItem = unwrap(
    createMenuItem(category, { name: { en: "Kebab", ar: "كباب" }, description: { en: "", ar: "" }, priceFils: 2500, sortOrder: 0 }, domainIds),
  );
  const size: OptionGroup = unwrap(
    createOptionGroup(restaurantId, { name: { en: "Size", ar: "الحجم" }, minSelect: 1, maxSelect: 1, sortOrder: 0 }, domainIds),
  );
  const large: MenuOption = unwrap(createOption(size, { name: { en: "Large", ar: "كبير" }, priceDeltaFils: 500, sortOrder: 0 }, domainIds));
  const small: MenuOption = unwrap(createOption(size, { name: { en: "Small", ar: "صغير" }, priceDeltaFils: 0, sortOrder: 1 }, domainIds));
  const entry: CatalogEntry = { item: kebab, category, groups: [{ group: size, options: [large, small] }] };
  return { entry, kebab, large, small, category };
}

function fakeCatalog(entries: CatalogEntry[]): OrderingCatalog {
  return {
    findEntries: async (restaurantId, itemIds) =>
      entries.filter((e) => e.item.restaurantId === restaurantId && itemIds.includes(e.item.id)),
  };
}

const placeDeps = (orders: OrderRepository, catalog: OrderingCatalog) => ({ orders, catalog, ids: domainIds, clock });

// ─── placeOrder ─────────────────────────────────────────────────────────

describe("placeOrder", () => {
  it("builds the order from the live menu, numbers it and stores it once", async () => {
    const { entry, kebab, large } = menu(R);
    const { repo, state } = fakeOrders();
    const place = makePlaceOrder(placeDeps(repo, fakeCatalog([entry])));

    const result = await place({
      restaurantId: R,
      sessionId: SESSION,
      kind: "TABLE" as const,
      rates: RATES,
      lines: [{ menuItemId: kebab.id, quantity: 2, selectedOptionIds: [large.id] }],
    });

    const order = unwrap(result);
    expect(order).toMatchObject({ status: "NEW", number: 1, restaurantId: R, sessionId: SESSION, taxRateBp: 1600 });
    expect(order.items[0]).toMatchObject({ unitPriceFils: 2500, quantity: 2, lineTotalFils: 6000 }); // (2.500 + 0.500) x 2
    expect(order.totalFils).toBe(7656); // 6.000 + 0.600 service + 1.056 tax
    expect(state.placed).toBe(1);
    expect(state.orders).toEqual([order]);
  });

  it("gives the next number to a second order in the same session, which starts at NEW again", async () => {
    const { entry, kebab, small } = menu(R);
    const { repo } = fakeOrders();
    const place = makePlaceOrder(placeDeps(repo, fakeCatalog([entry])));
    const cart = { restaurantId: R, sessionId: SESSION, kind: "TABLE" as const, rates: RATES, lines: [{ menuItemId: kebab.id, quantity: 1, selectedOptionIds: [small.id] }] };

    const first = unwrap(await place(cart));
    await makeMoveOrderStatus({ orders: repo, sessions: noVisits, clock })({ restaurantId: R, role: "WAITER" }, { orderId: first.id, to: "CONFIRMED" });
    const second = unwrap(await place(cart));

    expect(second).toMatchObject({ number: 2, status: "NEW", sessionId: SESSION });
    expect(second.id).not.toBe(first.id);
  });

  it("refuses an item that is not on this restaurant's menu, without using a number", async () => {
    const { entry, kebab } = menu(R);
    const foreign = menu(OTHER);
    const { repo, state } = fakeOrders();
    const place = makePlaceOrder(placeDeps(repo, fakeCatalog([entry, foreign.entry])));

    const missing = await place({ restaurantId: R, sessionId: SESSION, kind: "TABLE" as const, rates: RATES, lines: [{ menuItemId: "nope", quantity: 1, selectedOptionIds: [] }] });
    expect(missing).toEqual({ ok: false, error: { type: "ITEM_NOT_FOUND", menuItemId: "nope" } });

    // The other restaurant's item exists, but not for restaurant R.
    const stranger = await place({
      restaurantId: R,
      sessionId: SESSION,
      kind: "TABLE" as const,
      rates: RATES,
      lines: [{ menuItemId: foreign.kebab.id, quantity: 1, selectedOptionIds: [] }, { menuItemId: kebab.id, quantity: 1, selectedOptionIds: [] }],
    });
    expect(stranger).toEqual({ ok: false, error: { type: "ITEM_NOT_FOUND", menuItemId: foreign.kebab.id } });
    expect(state.counters.size).toBe(0);
    expect(state.placed).toBe(0);
  });

  it("refuses a bad cart BEFORE it uses up an order number", async () => {
    const { entry, kebab, large } = menu(R);
    const soldOut: CatalogEntry = { ...entry, item: unwrap(setItemSoldOut(kebab, true)) };
    const { repo, state } = fakeOrders();
    const line = (quantity: number, selectedOptionIds: string[]) => ({ menuItemId: kebab.id, quantity, selectedOptionIds });
    const cart = (lines: ReturnType<typeof line>[]) => ({ restaurantId: R, sessionId: SESSION, kind: "TABLE" as const, rates: RATES, lines });
    const good = makePlaceOrder(placeDeps(repo, fakeCatalog([entry])));

    expect(await good(cart([line(0, [large.id])]))).toMatchObject({ ok: false, error: { type: "INVALID_QUANTITY" } });
    expect(await good(cart([line(1, [])]))).toMatchObject({ ok: false, error: { type: "SELECTION", reason: { type: "TOO_FEW_OPTIONS" } } });
    expect(await good(cart([]))).toEqual({ ok: false, error: { type: "EMPTY_ORDER" } });
    expect(await makePlaceOrder(placeDeps(repo, fakeCatalog([soldOut])))(cart([line(1, [large.id])]))).toMatchObject({
      ok: false,
      error: { type: "ITEM_NOT_ORDERABLE" },
    });
    expect(await good({ ...cart([line(1, [large.id])]), rates: { taxRateBp: 12.5, serviceChargeBp: 0 } })).toEqual({
      ok: false,
      error: { type: "INVALID_RATES" },
    });

    expect(state.counters.size).toBe(0); // no number was handed out
    expect(state.placed).toBe(0);
  });

  it("treats a repeated submission (same request key) as the same order: no second order, no new number", async () => {
    const { entry, kebab, small } = menu(R);
    const { repo, state } = fakeOrders();
    const place = makePlaceOrder(placeDeps(repo, fakeCatalog([entry])));
    const cart = { restaurantId: R, sessionId: SESSION, kind: "TABLE" as const, rates: RATES, lines: [{ menuItemId: kebab.id, quantity: 1, selectedOptionIds: [small.id] }] };

    const first = unwrap(await place({ ...cart, requestId: "key-1" }));
    const again = unwrap(await place({ ...cart, requestId: "key-1" })); // the reply was lost, the guest pressed again
    expect(again).toEqual(first);
    expect(state.placed).toBe(1);
    expect(state.counters.get(R)).toBe(1); // the retry did not use up a number
    // The same question on its own (asked when the visit no longer takes orders): this key, this table, this restaurant.
    const findPlaced = makeFindPlacedOrder({ orders: repo });
    expect(await findPlaced({ restaurantId: R, sessionId: SESSION, requestId: "key-1" })).toEqual(first);
    expect(await findPlaced({ restaurantId: R, sessionId: SESSION, requestId: "key-9" })).toBeNull();
    expect(await findPlaced({ restaurantId: OTHER, sessionId: SESSION, requestId: "key-1" })).toBeNull();

    // A new key (the next thing the guest orders) and no key at all are new orders.
    expect(unwrap(await place({ ...cart, requestId: "key-2" })).number).toBe(2);
    expect(unwrap(await place(cart)).number).toBe(3);
    expect(unwrap(await place(cart)).number).toBe(4);
    // The same key at another table is somebody else's submission.
    const otherTable = "44444444-4444-4000-8000-000000000004" as TableSessionId;
    expect(unwrap(await place({ ...cart, sessionId: otherTable, requestId: "key-1" })).number).toBe(5);
    expect(state.placed).toBe(5);
  });

  it("returns the order already placed even if the item sold out before the retry", async () => {
    const { entry, kebab, small } = menu(R);
    const { repo, state } = fakeOrders();
    const cart = { restaurantId: R, sessionId: SESSION, kind: "TABLE" as const, rates: RATES, requestId: "key-1", lines: [{ menuItemId: kebab.id, quantity: 1, selectedOptionIds: [small.id] }] };
    const first = unwrap(await makePlaceOrder(placeDeps(repo, fakeCatalog([entry])))(cart));

    const soldOut: CatalogEntry = { ...entry, item: unwrap(setItemSoldOut(kebab, true)) };
    const retry = await makePlaceOrder(placeDeps(repo, fakeCatalog([soldOut])))(cart);
    expect(retry).toEqual({ ok: true, value: first });
    expect(state.placed).toBe(1);
  });

  it("when the same submission arrives twice at once, both get the one order that was stored", async () => {
    const { entry, kebab, small } = menu(R);
    const { repo, state } = fakeOrders();
    const place = makePlaceOrder(placeDeps(repo, fakeCatalog([entry])));
    const cart = { restaurantId: R, sessionId: SESSION, kind: "TABLE" as const, rates: RATES, requestId: "key-1", lines: [{ menuItemId: kebab.id, quantity: 1, selectedOptionIds: [small.id] }] };

    const first = unwrap(await place(cart));
    state.hideKeys = true; // the second call looked before the first was stored, so it goes on to store its own
    const second = unwrap(await place(cart));
    expect(second).toEqual(first); // ...and the store names the earlier order instead
    expect(state.placed).toBe(1);
    expect(state.orders).toHaveLength(1);
  });

  it("uses the live menu price, not anything the customer sent", async () => {
    const { entry, kebab, small } = menu(R);
    const repriced: CatalogEntry = { ...entry, item: { ...kebab, priceFils: 4000 as MenuItem["priceFils"] } };
    const { repo } = fakeOrders();
    const order = unwrap(
      await makePlaceOrder(placeDeps(repo, fakeCatalog([repriced])))({
        restaurantId: R,
        sessionId: SESSION,
        kind: "TABLE" as const,
        rates: { taxRateBp: 0, serviceChargeBp: 0 },
        lines: [{ menuItemId: kebab.id, quantity: 1, selectedOptionIds: [small.id] }],
      }),
    );
    expect(order.totalFils).toBe(4000);
  });
});

// ─── moveOrderStatus ────────────────────────────────────────────────────

async function orderAt(status: OrderStatus, restaurantId = R) {
  const { entry, kebab, small } = menu(restaurantId);
  const { repo, state } = fakeOrders();
  const placed = unwrap(
    await makePlaceOrder(placeDeps(repo, fakeCatalog([entry])))({
      restaurantId,
      sessionId: SESSION,
      kind: "TABLE" as const,
      rates: RATES,
      lines: [{ menuItemId: kebab.id, quantity: 1, selectedOptionIds: [small.id] }],
    }),
  );
  state.orders[0] = { ...placed, status };
  return { repo, state, id: placed.id };
}
const actor = (role: Role, restaurantId = R) => ({ restaurantId, role });

describe("moveOrderStatus", () => {
  it("lets the waiter take an order from NEW up to SERVED, and says when to notify the customer", async () => {
    const { repo, id } = await orderAt("NEW");
    const move = makeMoveOrderStatus({ orders: repo, sessions: noVisits, clock });
    const seen: [OrderStatus, boolean][] = [];
    for (const to of ["CONFIRMED", "PREPARING", "READY", "SERVED"] as const) {
      const r = unwrap(await move(actor("WAITER"), { orderId: id, to }));
      seen.push([r.order.status, r.notifyCustomer]);
    }
    expect(seen).toEqual([["CONFIRMED", false], ["PREPARING", false], ["READY", true], ["SERVED", false]]);
  });

  it("keeps COMPLETED for the cashier: the waiter is refused, the cashier may, after SERVED", async () => {
    const { repo, state, id } = await orderAt("SERVED");
    const move = makeMoveOrderStatus({ orders: repo, sessions: noVisits, clock });

    expect(await move(actor("WAITER"), { orderId: id, to: "COMPLETED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(state.statusWrites).toBe(0);

    const done = unwrap(await move(actor("CASHIER"), { orderId: id, to: "COMPLETED" }));
    expect(done.order.status).toBe("COMPLETED");
    expect(done.notifyCustomer).toBe(false);
    expect(state.orders[0]!.status).toBe("COMPLETED");
  });

  it("does not let the cashier move an order anywhere but COMPLETED, or skip ahead", async () => {
    const early = await orderAt("NEW");
    const move = makeMoveOrderStatus({ orders: early.repo, sessions: noVisits, clock });
    expect(await move(actor("CASHIER"), { orderId: early.id, to: "CONFIRMED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    // Permission is fine for COMPLETED, but the order is not SERVED yet: the domain refuses the jump.
    expect(await move(actor("CASHIER"), { orderId: early.id, to: "COMPLETED" })).toEqual({
      ok: false,
      error: { type: "INVALID_TRANSITION", from: "NEW", to: "COMPLETED" },
    });
    expect(early.state.statusWrites).toBe(0);
  });

  it("lets the owner and the manager do every step", async () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      const { repo, id } = await orderAt("NEW");
      const move = makeMoveOrderStatus({ orders: repo, sessions: noVisits, clock });
      for (const to of ORDER_FLOW.slice(1)) expect(unwrap(await move(actor(role), { orderId: id, to })).order.status).toBe(to);
    }
  });

  it("refuses skipping, going back and moving a COMPLETED order, without writing", async () => {
    const { repo, state, id } = await orderAt("CONFIRMED");
    const move = makeMoveOrderStatus({ orders: repo, sessions: noVisits, clock });
    expect(await move(actor("OWNER"), { orderId: id, to: "SERVED" })).toMatchObject({ ok: false, error: { type: "INVALID_TRANSITION" } });
    expect(await move(actor("OWNER"), { orderId: id, to: "NEW" })).toMatchObject({ ok: false, error: { type: "INVALID_TRANSITION" } });
    expect(state.statusWrites).toBe(0);
  });

  it("does not find another restaurant's order", async () => {
    const { repo, state, id } = await orderAt("NEW", OTHER);
    const result = await makeMoveOrderStatus({ orders: repo, sessions: noVisits, clock })(actor("OWNER", R), { orderId: id, to: "CONFIRMED" });
    expect(result).toEqual({ ok: false, error: { type: "ORDER_NOT_FOUND" } });
    expect(state.statusWrites).toBe(0);
    expect(await makeMoveOrderStatus({ orders: repo, sessions: noVisits, clock })(actor("OWNER"), { orderId: "missing" as OrderId, to: "CONFIRMED" })).toEqual({
      ok: false,
      error: { type: "ORDER_NOT_FOUND" },
    });
  });

  it("reports a conflict instead of success when the change did not happen", async () => {
    const { repo, state, id } = await orderAt("NEW");
    state.refuseStatus = true; // someone else moved it first, or the database refused
    const result = await makeMoveOrderStatus({ orders: repo, sessions: noVisits, clock })(actor("WAITER"), { orderId: id, to: "CONFIRMED" });
    expect(result).toEqual({ ok: false, error: { type: "CONFLICT" } });
    expect(state.orders[0]!.status).toBe("NEW");
  });
});

// ─── getStaffOrderList (orders with their table) ────────────────────────

const SESSION_2 = "33333333-3333-4000-8000-000000000033" as TableSessionId;

/** A visit at a table, started a given number of minutes before NOW. */
function visit(id: TableSessionId, label: string, over: Partial<SessionAtTable["session"]> & { minutesAgo?: number } = {}): SessionAtTable {
  const { minutesAgo = 10, ...rest } = over;
  return {
    tableLabel: label,
    session: {
      id,
      restaurantId: R,
      kind: "TABLE",
      tableId: `table-${label}` as TableId,
      customer: null,
      status: "OPEN",
      startedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
      endedAt: null,
      ...rest,
    },
  };
}
function fakeSessions(visits: SessionAtTable[]) {
  const asked: { restaurantId: string; sessionIds: string[] }[] = [];
  const repo: TableSessionRepository = {
    findWithTables: async (restaurantId, sessionIds) => {
      asked.push({ restaurantId, sessionIds: [...sessionIds] });
      return visits.filter((v) => sessionIds.includes(v.session.id));
    },
    updateStatus: async () => false, // the order list never moves a visit
    listLive: async () => visits,
  };
  return { repo, asked };
}

describe("getStaffOrderList", () => {
  it("gives every order in the open queue its table, asking once for all the tables", async () => {
    const first = await orderAt("NEW");
    const second = await orderAt("PREPARING");
    const elsewhere = await orderAt("READY");
    const done = await orderAt("COMPLETED");
    const foreign = await orderAt("NEW", OTHER);
    const orders = fakeOrders([
      ...first.state.orders,
      ...second.state.orders, // same table as the first
      ...elsewhere.state.orders.map((o) => ({ ...o, sessionId: SESSION_2 })),
      ...done.state.orders,
      ...foreign.state.orders,
    ]);
    const sessions = fakeSessions([visit(SESSION, "7"), visit(SESSION_2, "Terrace", { status: "PAYMENT_REQUESTED" })]);
    const list = await makeGetStaffOrderList({ orders: orders.repo, sessions: sessions.repo, clock })(actor("WAITER"));

    expect(list.map((e) => [e.order.status, e.table?.label, e.table?.sessionStatus])).toEqual([
      ["NEW", "7", "OPEN"],
      ["PREPARING", "7", "OPEN"],
      ["READY", "Terrace", "PAYMENT_REQUESTED"],
    ]);
    expect(list.map((e) => e.table?.sessionId)).toEqual([SESSION, SESSION, SESSION_2]);
    expect(sessions.asked).toEqual([{ restaurantId: R, sessionIds: [SESSION, SESSION_2] }]); // one lookup, each table once
  });

  it("shows a visit that ran out of time as CLOSED, whatever its stored status says", async () => {
    const a = await orderAt("SERVED");
    const sessions = fakeSessions([visit(SESSION, "7", { minutesAgo: 121 })]); // stored as OPEN, started over 2 hours ago
    const [entry] = await makeGetStaffOrderList({ orders: fakeOrders(a.state.orders).repo, sessions: sessions.repo, clock })(actor("CASHIER"));
    expect(entry?.table).toEqual({ sessionId: SESSION, kind: "TABLE", label: "7", customer: null, sessionStatus: "CLOSED" });
  });

  it("returns one table session's orders (the running bill), completed ones included", async () => {
    const a = await orderAt("SERVED");
    const done = await orderAt("COMPLETED");
    const deps = { orders: fakeOrders([...a.state.orders, ...done.state.orders]).repo, sessions: fakeSessions([visit(SESSION, "7")]).repo, clock };
    const bill = await makeGetStaffOrderList(deps)(actor("CASHIER"), { sessionId: SESSION });
    expect(bill.map((e) => [e.order.status, e.table?.label])).toEqual([["SERVED", "7"], ["COMPLETED", "7"]]);
    expect(await makeGetStaffOrderList(deps)(actor("CASHIER"), { sessionId: "other" as TableSessionId })).toEqual([]);
  });

  it("still lists an order whose table cannot be read, and never uses another restaurant's table", async () => {
    const a = await orderAt("NEW");
    const orders = fakeOrders(a.state.orders).repo;
    // The store knows nothing about the visit.
    expect((await makeGetStaffOrderList({ orders, sessions: fakeSessions([]).repo, clock })(actor("WAITER"))).map((e) => e.table)).toEqual([null]);
    // The store (wrongly) hands back a visit of another restaurant under the same id.
    const wrong = fakeSessions([visit(SESSION, "Not ours", { restaurantId: OTHER })]);
    expect((await makeGetStaffOrderList({ orders, sessions: wrong.repo, clock })(actor("WAITER"))).map((e) => e.table)).toEqual([null]);
  });

  it("does not ask about tables when there is nothing to show", async () => {
    const sessions = fakeSessions([visit(SESSION, "7")]);
    expect(await makeGetStaffOrderList({ orders: fakeOrders().repo, sessions: sessions.repo, clock })(actor("OWNER"))).toEqual([]);
    expect(sessions.asked).toEqual([]);
  });
});

// ─── cancelOrder ────────────────────────────────────────────────────────

describe("cancelOrder", () => {
  const cancelAs = async (role: Role, status: OrderStatus, reason = "GUEST_CHANGED_MIND", restaurantId = R) => {
    const at = await orderAt(status);
    const result = await makeCancelOrder({ orders: at.repo, sessions: noVisits, clock })(actor(role, restaurantId), { orderId: at.id, reason });
    return { result, stored: at.state.orders[0]! };
  };

  it("lets the waiter cancel before the kitchen starts, and returns the order as it was stored", async () => {
    for (const status of ["NEW", "CONFIRMED"] as const) {
      const { result, stored } = await cancelAs("WAITER", status, "ITEM_UNAVAILABLE");
      // The time and the person are the store's (the database stamps them), not the app's clock.
      expect(result).toMatchObject({ ok: true, value: { status: "CANCELLED", cancellation: { reason: "ITEM_UNAVAILABLE", at: STAMP, by: "staff-user" } } });
      expect(stored.status).toBe("CANCELLED");
    }
  });

  it("refuses the waiter once the order is being prepared, ready or served; owner and manager may", async () => {
    for (const status of ["PREPARING", "READY", "SERVED"] as const) {
      const waiter = await cancelAs("WAITER", status);
      expect(waiter.result).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
      expect(waiter.stored.status).toBe(status);
      for (const role of ["OWNER", "MANAGER"] as const) expect((await cancelAs(role, status)).result.ok).toBe(true);
    }
  });

  it("never lets the cashier cancel", async () => {
    for (const status of ["NEW", "CONFIRMED", "PREPARING", "READY", "SERVED"] as const) {
      const { result, stored } = await cancelAs("CASHIER", status);
      expect(result).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
      expect(stored.status).toBe(status);
    }
  });

  it("cancels nothing that is completed or cancelled already, whoever asks", async () => {
    for (const role of ["OWNER", "WAITER", "CASHIER"] as const) {
      expect((await cancelAs(role, "COMPLETED")).result).toEqual({ ok: false, error: { type: "INVALID_TRANSITION", from: "COMPLETED", to: "CANCELLED" } });
    }
    const at = await orderAt("NEW");
    const cancel = makeCancelOrder({ orders: at.repo, sessions: noVisits, clock });
    expect((await cancel(actor("OWNER"), { orderId: at.id, reason: "MISTAKE" })).ok).toBe(true);
    expect(await cancel(actor("OWNER"), { orderId: at.id, reason: "MISTAKE" })).toEqual({ ok: false, error: { type: "INVALID_TRANSITION", from: "CANCELLED", to: "CANCELLED" } });
  });

  it("needs a reason from the fixed list, and does not find another restaurant's order", async () => {
    expect((await cancelAs("OWNER", "NEW", "no reason")).result).toEqual({ ok: false, error: { type: "INVALID_CANCEL_REASON" } });
    expect((await cancelAs("OWNER", "NEW", "MISTAKE", OTHER)).result).toEqual({ ok: false, error: { type: "ORDER_NOT_FOUND" } });
  });

  it("reports a conflict when the store does not make the change (someone moved the order first)", async () => {
    const at = await orderAt("NEW");
    at.state.refuseStatus = true;
    expect(await makeCancelOrder({ orders: at.repo, sessions: noVisits, clock })(actor("WAITER"), { orderId: at.id, reason: "MISTAKE" })).toEqual({ ok: false, error: { type: "CONFLICT" } });
    expect(at.state.orders[0]!.status).toBe("NEW");
  });

  it("takes a cancelled order out of the staff queue but leaves it on the table's bill", async () => {
    const at = await orderAt("CONFIRMED");
    await makeCancelOrder({ orders: at.repo, sessions: noVisits, clock })(actor("WAITER"), { orderId: at.id, reason: "GUEST_CHANGED_MIND" });
    const deps = { orders: at.repo, sessions: fakeSessions([visit(SESSION, "7")]).repo, clock };
    expect(await makeGetStaffOrderList(deps)(actor("WAITER"))).toEqual([]);
    expect((await makeGetStaffOrderList(deps)(actor("CASHIER"), { sessionId: SESSION })).map((e) => e.order.status)).toEqual(["CANCELLED"]);
  });
});
