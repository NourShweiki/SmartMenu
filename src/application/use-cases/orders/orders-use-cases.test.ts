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
import { makeGetStaffOrders } from "./get-staff-orders";
import { makeMoveOrderStatus } from "./move-order-status";
import { makePlaceOrder } from "./place-order";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const OTHER = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const SESSION = "33333333-3333-4000-8000-000000000003" as TableSessionId;
const RATES = { taxRateBp: 1600, serviceChargeBp: 1000 };
const NOW = new Date("2026-10-10T12:00:00Z");

let n = 0;
const domainIds = { newId: () => `id-${++n}` };
const clock = { now: () => NOW };

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

// ─── Fakes ──────────────────────────────────────────────────────────────

function fakeOrders(initial: Order[] = []) {
  const state = { orders: [...initial], counters: new Map<string, number>(), placed: 0, statusWrites: 0, refuseStatus: false };
  const repo: OrderRepository = {
    nextNumber: async (restaurantId) => {
      const next = (state.counters.get(restaurantId) ?? 0) + 1;
      state.counters.set(restaurantId, next);
      return next;
    },
    place: async (order) => {
      state.placed++;
      state.orders.push(order);
    },
    findById: async (restaurantId, orderId) => state.orders.find((o) => o.restaurantId === restaurantId && o.id === orderId) ?? null,
    listOpen: async (restaurantId) =>
      state.orders.filter((o) => o.restaurantId === restaurantId && o.status !== "COMPLETED"),
    listBySession: async (restaurantId, sessionId) =>
      state.orders.filter((o) => o.restaurantId === restaurantId && o.sessionId === sessionId),
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
    const cart = { restaurantId: R, sessionId: SESSION, rates: RATES, lines: [{ menuItemId: kebab.id, quantity: 1, selectedOptionIds: [small.id] }] };

    const first = unwrap(await place(cart));
    await makeMoveOrderStatus({ orders: repo, clock })({ restaurantId: R, role: "WAITER" }, { orderId: first.id, to: "CONFIRMED" });
    const second = unwrap(await place(cart));

    expect(second).toMatchObject({ number: 2, status: "NEW", sessionId: SESSION });
    expect(second.id).not.toBe(first.id);
  });

  it("refuses an item that is not on this restaurant's menu, without using a number", async () => {
    const { entry, kebab } = menu(R);
    const foreign = menu(OTHER);
    const { repo, state } = fakeOrders();
    const place = makePlaceOrder(placeDeps(repo, fakeCatalog([entry, foreign.entry])));

    const missing = await place({ restaurantId: R, sessionId: SESSION, rates: RATES, lines: [{ menuItemId: "nope", quantity: 1, selectedOptionIds: [] }] });
    expect(missing).toEqual({ ok: false, error: { type: "ITEM_NOT_FOUND", menuItemId: "nope" } });

    // The other restaurant's item exists, but not for restaurant R.
    const stranger = await place({
      restaurantId: R,
      sessionId: SESSION,
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
    const cart = (lines: ReturnType<typeof line>[]) => ({ restaurantId: R, sessionId: SESSION, rates: RATES, lines });
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

  it("uses the live menu price, not anything the customer sent", async () => {
    const { entry, kebab, small } = menu(R);
    const repriced: CatalogEntry = { ...entry, item: { ...kebab, priceFils: 4000 as MenuItem["priceFils"] } };
    const { repo } = fakeOrders();
    const order = unwrap(
      await makePlaceOrder(placeDeps(repo, fakeCatalog([repriced])))({
        restaurantId: R,
        sessionId: SESSION,
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
    const move = makeMoveOrderStatus({ orders: repo, clock });
    const seen: [OrderStatus, boolean][] = [];
    for (const to of ["CONFIRMED", "PREPARING", "READY", "SERVED"] as const) {
      const r = unwrap(await move(actor("WAITER"), { orderId: id, to }));
      seen.push([r.order.status, r.notifyCustomer]);
    }
    expect(seen).toEqual([["CONFIRMED", false], ["PREPARING", false], ["READY", true], ["SERVED", false]]);
  });

  it("keeps COMPLETED for the cashier: the waiter is refused, the cashier may, after SERVED", async () => {
    const { repo, state, id } = await orderAt("SERVED");
    const move = makeMoveOrderStatus({ orders: repo, clock });

    expect(await move(actor("WAITER"), { orderId: id, to: "COMPLETED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(state.statusWrites).toBe(0);

    const done = unwrap(await move(actor("CASHIER"), { orderId: id, to: "COMPLETED" }));
    expect(done.order.status).toBe("COMPLETED");
    expect(done.notifyCustomer).toBe(false);
    expect(state.orders[0]!.status).toBe("COMPLETED");
  });

  it("does not let the cashier move an order anywhere but COMPLETED, or skip ahead", async () => {
    const early = await orderAt("NEW");
    const move = makeMoveOrderStatus({ orders: early.repo, clock });
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
      const move = makeMoveOrderStatus({ orders: repo, clock });
      for (const to of ORDER_FLOW.slice(1)) expect(unwrap(await move(actor(role), { orderId: id, to })).order.status).toBe(to);
    }
  });

  it("refuses skipping, going back and moving a COMPLETED order, without writing", async () => {
    const { repo, state, id } = await orderAt("CONFIRMED");
    const move = makeMoveOrderStatus({ orders: repo, clock });
    expect(await move(actor("OWNER"), { orderId: id, to: "SERVED" })).toMatchObject({ ok: false, error: { type: "INVALID_TRANSITION" } });
    expect(await move(actor("OWNER"), { orderId: id, to: "NEW" })).toMatchObject({ ok: false, error: { type: "INVALID_TRANSITION" } });
    expect(state.statusWrites).toBe(0);
  });

  it("does not find another restaurant's order", async () => {
    const { repo, state, id } = await orderAt("NEW", OTHER);
    const result = await makeMoveOrderStatus({ orders: repo, clock })(actor("OWNER", R), { orderId: id, to: "CONFIRMED" });
    expect(result).toEqual({ ok: false, error: { type: "ORDER_NOT_FOUND" } });
    expect(state.statusWrites).toBe(0);
    expect(await makeMoveOrderStatus({ orders: repo, clock })(actor("OWNER"), { orderId: "missing" as OrderId, to: "CONFIRMED" })).toEqual({
      ok: false,
      error: { type: "ORDER_NOT_FOUND" },
    });
  });

  it("reports a conflict instead of success when the change did not happen", async () => {
    const { repo, state, id } = await orderAt("NEW");
    state.refuseStatus = true; // someone else moved it first, or the database refused
    const result = await makeMoveOrderStatus({ orders: repo, clock })(actor("WAITER"), { orderId: id, to: "CONFIRMED" });
    expect(result).toEqual({ ok: false, error: { type: "CONFLICT" } });
    expect(state.orders[0]!.status).toBe("NEW");
  });
});

// ─── getStaffOrders ─────────────────────────────────────────────────────

describe("getStaffOrders", () => {
  it("returns the open queue (not COMPLETED) of the actor's restaurant only", async () => {
    const a = await orderAt("PREPARING");
    const done = await orderAt("COMPLETED");
    const foreign = await orderAt("NEW", OTHER);
    const all = fakeOrders([...a.state.orders, ...done.state.orders, ...foreign.state.orders]);
    const get = makeGetStaffOrders({ orders: all.repo });

    const open = await get(actor("CASHIER"));
    expect(open.map((o) => o.status)).toEqual(["PREPARING"]);
    expect(open.every((o) => o.restaurantId === R)).toBe(true);
  });

  it("returns one table session's orders, completed ones included", async () => {
    const a = await orderAt("SERVED");
    const done = await orderAt("COMPLETED");
    const all = fakeOrders([...a.state.orders, ...done.state.orders]);
    const orders = await makeGetStaffOrders({ orders: all.repo })(actor("WAITER"), { sessionId: SESSION });
    expect(orders.map((o) => o.status)).toEqual(["SERVED", "COMPLETED"]);
    expect(await makeGetStaffOrders({ orders: all.repo })(actor("WAITER"), { sessionId: "other" as TableSessionId })).toEqual([]);
  });
});

