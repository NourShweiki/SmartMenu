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
import { makeGetStaffOrders } from "@/application/use-cases/orders/get-staff-orders";
import { makeMoveOrderStatus } from "@/application/use-cases/orders/move-order-status";
import { makePlaceOrder } from "@/application/use-cases/orders/place-order";
import { createPublicClient, createServiceClient } from "./client";
import { SupabaseOrderRepository } from "./supabase-order-repository";
import { SupabaseOrderingCatalog } from "./supabase-ordering-catalog";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
// Table sessions do not exist yet, so a session is an opaque id. Fixed (not random) so leftovers can be found.
const SESSION = "c0ffee00-0000-4000-8000-0000000000aa" as TableSessionId;
const enabled = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function staffRepo(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return new SupabaseOrderRepository(db);
}

describe.skipIf(!enabled)("orders against local Supabase", () => {
  const service = enabled ? createServiceClient() : (undefined as never);
  let counterBefore: number | null = null;

  /** Deletes every order of the test session and puts the counter back to the highest remaining number. */
  async function sweep() {
    await service.from("orders").delete().eq("restaurant_id", GRILL).eq("session_id", SESSION); // lines + options cascade
    const { data } = await service.from("orders").select("number").eq("restaurant_id", GRILL).order("number", { ascending: false }).limit(1);
    await service.from("order_counters").upsert({ restaurant_id: GRILL, last_number: data?.[0]?.number ?? 0 });
  }

  beforeAll(async () => {
    await sweep(); // heal a previous run that was killed before its cleanup
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

    // Cashier: reads, cannot move earlier steps (database rule), completes the SERVED order.
    const cashierRepo = await staffRepo("cashier@demo-dinein.test");
    expect((await makeGetStaffOrders({ orders: cashierRepo })({ restaurantId: GRILL, role: "CASHIER" })).map((o) => o.id)).toContain(order.id);
    const done = await makeMoveOrderStatus({ orders: cashierRepo, clock })({ restaurantId: GRILL, role: "CASHIER" }, { orderId: order.id, to: "COMPLETED" });
    if (!done.ok) throw new Error(JSON.stringify(done.error));
    expect((await cashierRepo.findById(GRILL, order.id))!.status).toBe("COMPLETED");
    expect((await waiterRepo.listOpen(GRILL)).map((o) => o.id)).not.toContain(order.id); // no longer in the open queue
    expect(await cashierRepo.updateStatus(GRILL, order.id, "COMPLETED", "NEW")).toBe(false); // cannot go back
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
});
