// End-to-end for orders against the LOCAL Supabase: real adapters + real use cases.
// Customer side (service role): place an order from the live demo menu. Staff side (signed-in users): read it,
// move it through the flow as the waiter and the cashier, and check what other roles / restaurants may NOT do.
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// The orders it creates are deleted at the end and the restaurant's order counter is put back. Self-healing: they all
// use ONE fixed session id, so a run that was killed halfway is swept up by the next run before it starts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MenuItemId } from "@/domain/menu/menu";
import type { OrderId, TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { makeCancelOrder } from "@/application/use-cases/orders/cancel-order";
import { makeGetStaffOrderList } from "@/application/use-cases/orders/get-staff-order-list";
import { makeMoveOrderStatus } from "@/application/use-cases/orders/move-order-status";
import { makeGetOpenVisits } from "@/application/use-cases/tables/get-open-visits";
import { makeMoveTableSession } from "@/application/use-cases/tables/move-table-session";
import { makePlaceOrder } from "@/application/use-cases/orders/place-order";
import { createPublicClient, createServiceClient } from "./client";
import { SupabaseOrderRepository } from "./supabase-order-repository";
import { SupabaseOrderingCatalog } from "./supabase-ordering-catalog";
import { SupabaseTableSessionRepository } from "./supabase-table-session-repository";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
// Orders belong to a real OPEN table session. The table and session are created by the test with FIXED ids
// (not random), so leftovers from a killed run can be found and swept.
const SESSION = "c0ffee00-0000-4000-8000-0000000000aa" as TableSessionId;
const IT_TABLE = "c0ffee00-0000-4000-8000-0000000000ab";
const enabled = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function staffClient(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return db;
}
const staffRepo = async (email: string) => new SupabaseOrderRepository(await staffClient(email));

describe.skipIf(!enabled)("orders against local Supabase", () => {
  const service = enabled ? createServiceClient() : (undefined as never);
  let counterBefore: number | null = null;

  /** Deletes every order of the test session and puts the counter back to the highest remaining number. */
  async function sweep() {
    await service.from("orders").delete().eq("restaurant_id", GRILL).eq("session_id", SESSION); // lines + options cascade
    await service.from("table_sessions").delete().eq("id", SESSION);
    await service.from("restaurant_tables").delete().eq("id", IT_TABLE);
    const { data } = await service.from("orders").select("number").eq("restaurant_id", GRILL).order("number", { ascending: false }).limit(1);
    await service.from("order_counters").upsert({ restaurant_id: GRILL, last_number: data?.[0]?.number ?? 0 });
  }

  beforeAll(async () => {
    await sweep(); // heal a previous run that was killed before its cleanup
    await service.from("restaurant_tables").insert({ id: IT_TABLE, restaurant_id: GRILL, label: "IT-orders", token: "it-orders-token-00000000000001" });
    await service.from("table_sessions").insert({ id: SESSION, restaurant_id: GRILL, table_id: IT_TABLE });
  });

  afterAll(async () => {
    await sweep();
  });

  it("places an order from the live menu, then walks it to COMPLETED as waiter and cashier", async () => {
    const before = await service.from("order_counters").select("last_number").eq("restaurant_id", GRILL).maybeSingle();
    counterBefore = before.data?.last_number ?? 0;

    // Two live demo items: the Kebab (has required option groups) and Hummus.
    const { data: items } = await service.from("menu_items").select("id, name_en").eq("restaurant_id", GRILL).in("name_en", ["Kebab", "Hummus"]);
    const kebabId = items?.find((i) => i.name_en === "Kebab")?.id as MenuItemId;
    const hummusId = items?.find((i) => i.name_en === "Hummus")?.id as MenuItemId;
    expect(kebabId && hummusId).toBeTruthy();

    const catalog = new SupabaseOrderingCatalog(service);
    const [kebab] = await catalog.findEntries(GRILL, [kebabId]);
    // Satisfy every required group by picking its first live option.
    const picks = kebab!.groups.flatMap(({ group, options }) => options.slice(0, group.minSelect).map((o) => o.id));

    const serverRepo = new SupabaseOrderRepository(service, service);
    const place = makePlaceOrder({ orders: serverRepo, catalog, ids: { newId: () => crypto.randomUUID() }, clock: { now: () => new Date() } });
    const placed = await place({
      restaurantId: GRILL,
      sessionId: SESSION,
      rates: { taxRateBp: 1600, serviceChargeBp: 1000 },
      lines: [
        { menuItemId: kebabId, quantity: 2, selectedOptionIds: picks },
        { menuItemId: hummusId, quantity: 1, selectedOptionIds: [] },
      ],
    });
    if (!placed.ok) throw new Error(JSON.stringify(placed.error));
    const order = placed.value;
    expect(order).toMatchObject({ status: "NEW", number: (counterBefore ?? 0) + 1 });

    // Staff read it back exactly as it was placed, lines in the order they were ordered.
    const waiterRepo = await staffRepo("waiter@demo-dinein.test");
    const stored = await waiterRepo.findById(GRILL, order.id);
    expect(stored).toEqual(order);
    expect(stored!.items.map((i) => i.name.en)).toEqual(["Kebab", "Hummus"]);
    expect((await waiterRepo.listOpen(GRILL)).map((o) => o.id)).toContain(order.id);
    expect((await waiterRepo.listBySession(GRILL, SESSION)).map((o) => o.id)).toEqual([order.id]);

    // Waiter: NEW -> SERVED. Not allowed to complete.
    const clock = { now: () => new Date() };
    const waiter = { restaurantId: GRILL, role: "WAITER" } as const;
    const moveAsWaiter = makeMoveOrderStatus({ orders: waiterRepo, clock });
    for (const to of ["CONFIRMED", "PREPARING", "READY", "SERVED"] as const) {
      const moved = await moveAsWaiter(waiter, { orderId: order.id, to });
      if (!moved.ok) throw new Error(JSON.stringify(moved.error));
      expect(moved.value.notifyCustomer).toBe(to === "READY");
    }
    expect(await moveAsWaiter(waiter, { orderId: order.id, to: "COMPLETED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    // ...and even bypassing the use case, the DATABASE refuses the waiter the last step.
    expect(await waiterRepo.updateStatus(GRILL, order.id, "SERVED", "COMPLETED")).toBe(false);

    // The open tables screen (real adapters): this table with its order on the bill, and it cannot be closed yet.
    const waiterDb = await staffClient("waiter@demo-dinein.test");
    const openVisits = makeGetOpenVisits({ sessions: new SupabaseTableSessionRepository(waiterDb), orders: new SupabaseOrderRepository(waiterDb), clock });
    const visitNow = async () => (await openVisits({ restaurantId: GRILL, role: "WAITER" })).find((v) => v.session.id === SESSION);
    expect(await visitNow()).toMatchObject({ tableLabel: "IT-orders", status: "OPEN", unfinished: 1, bill: { totalFils: order.totalFils } });
    expect((await visitNow())!.orders.map((o) => [o.id, o.status])).toEqual([[order.id, "SERVED"]]);

    // Cashier: reads, cannot move earlier steps (database rule), completes the SERVED order.
    const cashierDb = await staffClient("cashier@demo-dinein.test");
    const cashierRepo = new SupabaseOrderRepository(cashierDb);
    // The staff order list (what the order screen will show): the order is in the open queue WITH its table.
    const cashierList = makeGetStaffOrderList({ orders: cashierRepo, sessions: new SupabaseTableSessionRepository(cashierDb), clock });
    const closeVisit = () =>
      makeMoveTableSession({ sessions: new SupabaseTableSessionRepository(cashierDb), orders: cashierRepo, clock })({ restaurantId: GRILL, role: "CASHIER" }, { sessionId: SESSION, to: "CLOSED" });
    expect(await closeVisit()).toEqual({ ok: false, error: { type: "UNFINISHED_ORDERS", count: 1 } }); // the served order is not paid yet
    const queue = await cashierList({ restaurantId: GRILL, role: "CASHIER" });
    expect(queue.find((e) => e.order.id === order.id)?.table).toEqual({ sessionId: SESSION, label: "IT-orders", sessionStatus: "OPEN" });
    expect(queue.every((e) => e.order.restaurantId === GRILL && e.table !== null)).toBe(true);
    const done = await makeMoveOrderStatus({ orders: cashierRepo, clock })({ restaurantId: GRILL, role: "CASHIER" }, { orderId: order.id, to: "COMPLETED" });
    if (!done.ok) throw new Error(JSON.stringify(done.error));
    expect((await cashierRepo.findById(GRILL, order.id))!.status).toBe("COMPLETED");
    expect((await waiterRepo.listOpen(GRILL)).map((o) => o.id)).not.toContain(order.id); // no longer in the open queue
    // ...but still on the table's bill, where completed orders stay.
    expect((await cashierList({ restaurantId: GRILL, role: "CASHIER" }, { sessionId: SESSION })).map((e) => [e.order.id, e.order.status, e.table?.label])).toEqual([
      [order.id, "COMPLETED", "IT-orders"],
    ]);
    expect(await cashierRepo.updateStatus(GRILL, order.id, "COMPLETED", "NEW")).toBe(false); // cannot go back
    // Everything on the bill is completed: the table shows nothing unfinished (the bill is still there to read).
    expect(await visitNow()).toMatchObject({ unfinished: 0, bill: { totalFils: order.totalFils } });
  });

  it("a repeated submission (same request key) returns the first order and stores nothing new", async () => {
    const serverRepo = new SupabaseOrderRepository(service, service);
    const catalog = new SupabaseOrderingCatalog(service);
    const { data } = await service.from("menu_items").select("id").eq("restaurant_id", GRILL).eq("name_en", "Hummus").single();
    const place = makePlaceOrder({ orders: serverRepo, catalog, ids: { newId: () => crypto.randomUUID() }, clock: { now: () => new Date() } });
    const cart = {
      restaurantId: GRILL,
      sessionId: SESSION,
      rates: { taxRateBp: 1600, serviceChargeBp: 1000 },
      lines: [{ menuItemId: data!.id as MenuItemId, quantity: 1, selectedOptionIds: [] }],
    };
    const key = crypto.randomUUID();
    const countInSession = async () => (await serverRepo.listBySession(GRILL, SESSION)).length;
    const before = await countInSession();
    const counter = async () => (await service.from("order_counters").select("last_number").eq("restaurant_id", GRILL).single()).data!.last_number as number;

    const first = await place({ ...cart, requestId: key });
    if (!first.ok) throw new Error(JSON.stringify(first.error));
    const numbersUsed = await counter();

    // The retry: same key. Same order back, no new row, no order number used up.
    const retry = await place({ ...cart, requestId: key });
    expect(retry).toEqual(first);
    expect(await countInSession()).toBe(before + 1);
    expect(await counter()).toBe(numbersUsed);
    expect(await serverRepo.findByRequest(GRILL, SESSION, key)).toEqual(first.value);

    // Two copies arriving together (neither sees the other when it looks first): the database keeps one.
    const key2 = crypto.randomUUID();
    const [a, b] = await Promise.all([place({ ...cart, requestId: key2 }), place({ ...cart, requestId: key2 })]);
    if (!a.ok || !b.ok) throw new Error("parallel placing failed");
    expect(a.value.id).toBe(b.value.id);
    expect(await countInSession()).toBe(before + 2);

    // A new key is a new order; a key that is not a real id finds nothing.
    const next = await place({ ...cart, requestId: crypto.randomUUID() });
    if (!next.ok) throw new Error(JSON.stringify(next.error));
    expect(next.value.id).not.toBe(first.value.id);
    expect(await serverRepo.findByRequest(GRILL, SESSION, "not-a-key")).toBeNull();
  });

  it("keeps orders away from other restaurants and refuses a second move from a stale status", async () => {
    const serverRepo = new SupabaseOrderRepository(service, service);
    const catalog = new SupabaseOrderingCatalog(service);
    const { data } = await service.from("menu_items").select("id").eq("restaurant_id", GRILL).eq("name_en", "Hummus").single();
    const place = makePlaceOrder({ orders: serverRepo, catalog, ids: { newId: () => crypto.randomUUID() }, clock: { now: () => new Date() } });
    const placed = await place({
      restaurantId: GRILL,
      sessionId: SESSION,
      rates: { taxRateBp: 0, serviceChargeBp: 0 },
      lines: [{ menuItemId: data!.id as MenuItemId, quantity: 1, selectedOptionIds: [] }],
    });
    if (!placed.ok) throw new Error(JSON.stringify(placed.error));
    const id = placed.value.id as OrderId;

    // Demo Coffee's owner cannot see or move a Demo Grill order.
    const coffee = await staffRepo("owner@demo-takeout.test");
    expect(await coffee.findById(GRILL, id)).toBeNull();
    expect(await coffee.updateStatus(GRILL, id, "NEW", "CONFIRMED")).toBe(false);

    // Two staff try the same move: the second one sees the order is no longer NEW.
    const owner = await staffRepo("owner@demo-dinein.test");
    expect(await owner.updateStatus(GRILL, id, "NEW", "CONFIRMED")).toBe(true);
    expect(await owner.updateStatus(GRILL, id, "NEW", "CONFIRMED")).toBe(false);

    // The catalog never hands one restaurant's menu to another.
    expect(await catalog.findEntries("22222222-2222-4000-8000-000000000002" as RestaurantId, [data!.id as MenuItemId])).toEqual([]);
  });

  // LAST in this file on purpose: it ends by closing the shared table session.
  it("cancelling by role, what a cancellation leaves behind, and closing the table once nothing is unfinished", async () => {
    const serverRepo = new SupabaseOrderRepository(service, service);
    const catalog = new SupabaseOrderingCatalog(service);
    const { data } = await service.from("menu_items").select("id").eq("restaurant_id", GRILL).eq("name_en", "Hummus").single();
    const place = makePlaceOrder({ orders: serverRepo, catalog, ids: { newId: () => crypto.randomUUID() }, clock: { now: () => new Date() } });
    const placeOne = async () => {
      const placed = await place({ restaurantId: GRILL, sessionId: SESSION, rates: { taxRateBp: 1600, serviceChargeBp: 1000 }, lines: [{ menuItemId: data!.id as MenuItemId, quantity: 1, selectedOptionIds: [] }] });
      if (!placed.ok) throw new Error(JSON.stringify(placed.error));
      return placed.value;
    };
    const clock = { now: () => new Date() };
    const waiterDb = await staffClient("waiter@demo-dinein.test");
    const cashierDb = await staffClient("cashier@demo-dinein.test");
    const ownerDb = await staffClient("owner@demo-dinein.test");
    const [waiterRepo, cashierRepo, ownerRepo] = [waiterDb, cashierDb, ownerDb].map((db) => new SupabaseOrderRepository(db)) as [SupabaseOrderRepository, SupabaseOrderRepository, SupabaseOrderRepository];
    const waiter = { restaurantId: GRILL, role: "WAITER" } as const;
    const cashier = { restaurantId: GRILL, role: "CASHIER" } as const;
    const owner = { restaurantId: GRILL, role: "OWNER" } as const;
    const waiterId = (await waiterDb.auth.getUser()).data.user!.id;

    // The waiter cancels a NEW order: kept, with the reason, and the database stamps when and who.
    const fresh = await placeOne();
    const cancelled = await makeCancelOrder({ orders: waiterRepo, clock })(waiter, { orderId: fresh.id, reason: "GUEST_CHANGED_MIND" });
    if (!cancelled.ok) throw new Error(JSON.stringify(cancelled.error));
    expect(cancelled.value).toMatchObject({ status: "CANCELLED", cancellation: { reason: "GUEST_CHANGED_MIND", by: waiterId }, totalFils: fresh.totalFils });
    expect(cancelled.value.cancellation!.at).toBeInstanceOf(Date);
    expect(await waiterRepo.findById(GRILL, fresh.id)).toEqual(cancelled.value);
    // Final: it cannot be moved, cancelled again, or have its reason changed.
    expect(await waiterRepo.updateStatus(GRILL, fresh.id, "CANCELLED", "CONFIRMED")).toBe(false);
    expect(await ownerRepo.cancel(GRILL, fresh.id, "CANCELLED", "MISTAKE")).toBe(false);
    expect((await ownerRepo.findById(GRILL, fresh.id))!.cancellation!.reason).toBe("GUEST_CHANGED_MIND");

    // The cashier never cancels: refused by the use case, and by the DATABASE when the use case is bypassed.
    const second = await placeOne();
    expect(await makeCancelOrder({ orders: cashierRepo, clock })(cashier, { orderId: second.id, reason: "MISTAKE" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(await cashierRepo.cancel(GRILL, second.id, "NEW", "MISTAKE")).toBe(false);
    // Another restaurant's owner cannot either.
    expect(await (await staffRepo("owner@demo-takeout.test")).cancel(GRILL, second.id, "NEW", "MISTAKE")).toBe(false);

    // Once the kitchen has started, the waiter is refused (use case and database); the owner may.
    for (const to of ["CONFIRMED", "PREPARING"] as const) expect(await ownerRepo.updateStatus(GRILL, second.id, to === "CONFIRMED" ? "NEW" : "CONFIRMED", to)).toBe(true);
    expect(await makeCancelOrder({ orders: waiterRepo, clock })(waiter, { orderId: second.id, reason: "MISTAKE" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(await waiterRepo.cancel(GRILL, second.id, "PREPARING", "MISTAKE")).toBe(false);
    expect((await waiterRepo.findById(GRILL, second.id))!.status).toBe("PREPARING");
    expect((await makeCancelOrder({ orders: ownerRepo, clock })(owner, { orderId: second.id, reason: "ITEM_UNAVAILABLE" })).ok).toBe(true);

    // A cancelled order leaves the queue, stays on the table's bill, and counts as zero there.
    const sessions = new SupabaseTableSessionRepository(cashierDb);
    expect((await waiterRepo.listOpen(GRILL)).map((o) => o.id)).not.toContain(fresh.id);
    const visit = async () => (await makeGetOpenVisits({ sessions, orders: cashierRepo, clock })(cashier)).find((v) => v.session.id === SESSION)!;
    const before = await visit();
    expect(before.orders.filter((o) => o.id === fresh.id || o.id === second.id).map((o) => o.status)).toEqual(["CANCELLED", "CANCELLED"]);
    const charged = before.orders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + o.totalFils, 0);
    expect(before.bill.totalFils).toBe(charged);

    // Closing the table: one unfinished order is enough to refuse it, in the use case AND in the database.
    const third = await placeOne();
    const close = () => makeMoveTableSession({ sessions, orders: cashierRepo, clock })(cashier, { sessionId: SESSION, to: "CLOSED" });
    expect(await close()).toMatchObject({ ok: false, error: { type: "UNFINISHED_ORDERS" } });
    expect(await sessions.updateStatus(GRILL, SESSION, "OPEN", "CLOSED")).toBe(false); // the use case bypassed: the trigger says no
    // The owner cancels everything that is still unfinished in this visit (this test's order and any left by the others).
    for (const o of (await ownerRepo.listBySession(GRILL, SESSION)).filter((x) => x.status !== "COMPLETED" && x.status !== "CANCELLED")) {
      expect((await makeCancelOrder({ orders: ownerRepo, clock })(owner, { orderId: o.id, reason: "OTHER" })).ok).toBe(true);
    }
    expect((await ownerRepo.findById(GRILL, third.id))!.status).toBe("CANCELLED");
    expect((await visit()).unfinished).toBe(0);
    expect(await close()).toMatchObject({ ok: true, value: { session: { status: "CLOSED" } } });
    // The visit is over: nothing more can be ordered into it.
    await expect(placeOne()).rejects.toThrow();
  });
});
