// Takeout against the LOCAL Supabase: a pickup order starts its visit through the real place_order, staff read it
// with its customer, the cashier takes it through every step, and the visit ends with its last order.
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// It works in a restaurant it makes itself ("itest-pickup-..."), removed before and after with everything in it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserId } from "@/application/ports/auth-gateway";
import { makeGetStaffOrderList } from "@/application/use-cases/orders/get-staff-order-list";
import { makeMoveOrderStatus } from "@/application/use-cases/orders/move-order-status";
import { makePlaceOrder, makePlacePickupOrder } from "@/application/use-cases/orders/place-order";
import { makeGetOpenVisits } from "@/application/use-cases/tables/get-open-visits";
import { makeAddStaffMember, type TeamActor } from "@/application/use-cases/staff/staff-use-cases";
import type { MenuItemId } from "@/domain/menu/menu";
import type { OrderId, TableSessionId } from "@/domain/order/order";
import { createRestaurant, type RestaurantId } from "@/domain/restaurant/restaurant";
import { newTemporaryPassword } from "../random-token";
import { createPublicClient, createServiceClient } from "./client";
import { SupabaseAccountDirectory } from "./supabase-account-directory";
import { SupabaseOrderRepository } from "./supabase-order-repository";
import { SupabaseOrderingCatalog } from "./supabase-ordering-catalog";
import { SupabaseRestaurantDirectory } from "./supabase-restaurant-directory";
import { SupabaseStaffAccountPolicy, SupabaseStaffRepository } from "./supabase-staff-repository";
import { SupabaseTableSessionGateway } from "./supabase-table-session-gateway";
import { SupabaseTableSessionRepository } from "./supabase-table-session-repository";

const FOUNDER = "cccc0001-0000-4000-8000-000000000001" as UserId;
const run = crypto.randomUUID().slice(0, 8);
const slug = `itest-pickup-${run}`;
const mail = (who: string) => `itest-pickup-${run}-${who}@test.local`;
const RATES = { taxRateBp: 1600, serviceChargeBp: 1000 }; // the service charge must NOT reach a takeout order
const clock = { now: () => new Date() };

let restaurantId: RestaurantId;
let itemId: MenuItemId;
const passwords = { owner: "", cashier: "", waiter: "" };

async function sweep() {
  const service = createServiceClient();
  const { error } = await service.from("restaurants").delete().like("slug", "itest-pickup-%"); // visits, orders, menu, members go with it
  if (error) throw error;
  const { data, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  for (const user of data.users) {
    if (user.email?.startsWith("itest-pickup-")) await service.auth.admin.deleteUser(user.id);
  }
}

async function staffClient(who: keyof typeof passwords) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email: mail(who), password: passwords[who] });
  if (error) throw error;
  return db;
}

/** The customer's side, wired as the container wires it (server-side, service role). */
function customerSide() {
  const service = createServiceClient();
  const deps = { orders: new SupabaseOrderRepository(service, service), catalog: new SupabaseOrderingCatalog(service), ids: { newId: () => crypto.randomUUID() }, clock };
  return { placePickup: makePlacePickupOrder(deps), place: makePlaceOrder(deps), visits: new SupabaseTableSessionGateway(createPublicClient()) };
}

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("takeout (pickup orders) against local Supabase", () => {
  beforeAll(async () => {
    await sweep();
    const service = createServiceClient();
    const accounts = new SupabaseAccountDirectory(service);
    // A takeout-only restaurant with an owner, made the way the setup tool makes one...
    passwords.owner = newTemporaryPassword();
    const owner = await accounts.create(mail("owner"), passwords.owner);
    if (!owner.ok) throw new Error("could not make the test owner");
    const draft = createRestaurant({ slug, name: { en: "Pickup Test", ar: "اختبار السفري" }, businessType: "takeout" }, { newId: () => crypto.randomUUID(), now: () => new Date() });
    if (!draft.ok) throw new Error("bad test restaurant");
    restaurantId = draft.value.id;
    const stored = await new SupabaseRestaurantDirectory(service).create(FOUNDER, draft.value, owner.value.userId);
    if (!stored.ok) throw new Error(`could not store the test restaurant: ${stored.error.type}`);
    // ...a cashier and a waiter, added the way the Staff screen adds them...
    const ownerDb = createPublicClient();
    await ownerDb.auth.signInWithPassword({ email: mail("owner"), password: passwords.owner });
    const actor: TeamActor = { restaurantId, role: "OWNER", userId: owner.value.userId };
    const team = { staff: new SupabaseStaffRepository(ownerDb), accounts, policy: new SupabaseStaffAccountPolicy(service), passwords: { newPassword: newTemporaryPassword } };
    for (const [who, role] of [["cashier", "CASHIER"], ["waiter", "WAITER"]] as const) {
      const added = await makeAddStaffMember(team)(actor, { email: mail(who), role });
      if (!added.ok) throw new Error(`could not add the ${who}: ${added.error.type}`);
      passwords[who] = added.value.temporaryPassword;
    }
    // ...and one thing on the menu.
    const category = await service.from("menu_categories").insert({ restaurant_id: restaurantId, name_en: "Coffee", name_ar: "قهوة" }).select("id").single();
    if (category.error) throw category.error;
    const item = await service.from("menu_items").insert({ restaurant_id: restaurantId, category_id: category.data.id, name_en: "Arabic coffee", name_ar: "قهوة عربية", price_fils: 2500 }).select("id").single();
    if (item.error) throw item.error;
    itemId = item.data.id as MenuItemId;
  });
  afterAll(sweep);

  it("a takeout order starts its visit, is followed by the customer, run by the cashier, and the visit ends with it", async () => {
    const customer = customerSide();
    const cart = [{ menuItemId: itemId, quantity: 2, selectedOptionIds: [] }];
    const key = crypto.randomUUID();

    const placed = await customer.placePickup({ restaurantId, rates: RATES, lines: cart, requestId: key, customer: { name: "  Ali   Hasan ", phone: "079 123 4567" } });
    if (!placed.ok) throw new Error(`expected an order, got ${JSON.stringify(placed.error)}`);
    const { order } = placed.value;
    const visitId = order.sessionId;
    expect(visitId).toBe(key); // the submission key is the visit's id
    // 2 x 2.500 = 5.000, no service charge, tax 16% = 0.800.
    expect(order).toMatchObject({ number: 1, status: "NEW", subtotalFils: 5000, serviceChargeFils: 0, serviceChargeBp: 0, taxFils: 800, totalFils: 5800 });

    // The same submission again: the same order, no second visit, no number used up.
    const again = await customer.placePickup({ restaurantId, rates: RATES, lines: cart, requestId: key, customer: { name: "Ali Hasan", phone: "0791234567" } });
    expect(again.ok && again.value.order.id).toBe(order.id);

    // The customer's phone: a pickup visit under their name (never the number back), with the order to follow.
    expect(await customer.visits.find(slug, visitId)).toEqual({ sessionId: visitId, kind: "PICKUP", customerName: "Ali Hasan", status: "OPEN" });
    expect((await customer.visits.orders(slug, visitId)).map((o) => [o.number, o.status, o.totalFils])).toEqual([[1, "NEW", 5800]]);
    expect(await customer.visits.find("demo-dinein", visitId)).toBeNull(); // not at another restaurant's address

    // Ordering again while the visit is open: into the same visit, still without a service charge.
    const more = await customer.place({ restaurantId, sessionId: visitId, kind: "PICKUP", rates: RATES, lines: cart, requestId: crypto.randomUUID() });
    if (!more.ok) throw new Error(`expected a second order, got ${JSON.stringify(more.error)}`);
    expect(more.value).toMatchObject({ number: 2, sessionId: visitId, serviceChargeFils: 0 });

    // Staff: the cashier sees both in the queue with the customer's name and number, and no "open table" for them.
    const cashierDb = await staffClient("cashier");
    const cashier = { restaurantId, role: "CASHIER" } as const;
    const cashierOrders = new SupabaseOrderRepository(cashierDb);
    const cashierSessions = new SupabaseTableSessionRepository(cashierDb);
    const queue = await makeGetStaffOrderList({ orders: cashierOrders, sessions: cashierSessions, clock })(cashier);
    expect(queue.map((e) => [e.order.number, e.table])).toEqual([
      [1, { sessionId: visitId, kind: "PICKUP", label: null, customer: { name: "Ali Hasan", phone: "+962791234567" }, sessionStatus: "OPEN" }],
      [2, { sessionId: visitId, kind: "PICKUP", label: null, customer: { name: "Ali Hasan", phone: "+962791234567" }, sessionStatus: "OPEN" }],
    ]);
    expect(await makeGetOpenVisits({ sessions: cashierSessions, orders: cashierOrders, clock })(cashier)).toEqual([]);

    // The cashier alone takes order 1 from new to completed (at a table they could only complete).
    const moveAsCashier = makeMoveOrderStatus({ orders: cashierOrders, sessions: cashierSessions, clock });
    for (const to of ["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"] as const) {
      const moved = await moveAsCashier(cashier, { orderId: order.id, to });
      expect(moved.ok && moved.value.order.status).toBe(to);
    }
    expect((await customer.visits.find(slug, visitId))?.status).toBe("OPEN"); // order 2 is still on its way

    // The waiter cancels order 2 (the kitchen has not started): the visit ends by itself, and takes no more orders.
    const waiterDb = await staffClient("waiter");
    expect(await new SupabaseOrderRepository(waiterDb).cancel(restaurantId, more.value.id as OrderId, "NEW", "GUEST_CHANGED_MIND")).toBe(true);
    expect((await customer.visits.find(slug, visitId))?.status).toBe("CLOSED");
    expect((await customer.visits.orders(slug, visitId)).map((o) => o.status)).toEqual(["COMPLETED", "CANCELLED"]);
    await expect(customer.place({ restaurantId, sessionId: visitId, kind: "PICKUP", rates: RATES, lines: cart, requestId: crypto.randomUUID() })).rejects.toThrow(/place_order failed/);
  });

  it("refuses a pickup order where takeout is switched off, leaving no visit behind", async () => {
    const service = createServiceClient();
    const off = await service.from("restaurant_settings").update({ takeout_enabled: false, dine_in_enabled: true }).eq("restaurant_id", restaurantId);
    if (off.error) throw off.error;
    try {
      const key = crypto.randomUUID();
      await expect(
        customerSide().placePickup({ restaurantId, rates: RATES, lines: [{ menuItemId: itemId, quantity: 1, selectedOptionIds: [] }], requestId: key, customer: { name: "Ali", phone: "0791234567" } }),
      ).rejects.toThrow(/takeout is switched off/);
      const { data } = await service.from("table_sessions").select("id").eq("id", key as TableSessionId);
      expect(data).toEqual([]);
    } finally {
      await service.from("restaurant_settings").update({ takeout_enabled: true, dine_in_enabled: false }).eq("restaurant_id", restaurantId);
    }
  });
});
