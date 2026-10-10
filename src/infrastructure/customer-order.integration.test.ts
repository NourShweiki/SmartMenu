// A guest's whole path against the LOCAL Supabase: scan a table's QR code -> see the menu and the cart preview ->
// press "Place order" -> staff see the order. Real adapters, real use cases, and the same `placeCustomerOrder` the
// cart's server action calls (only the host and the cookie, which need a browser, are replaced by plain values).
// It sits next to the composition root because, like `container.ts`, it wires the interface to real adapters.
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// It creates ONE table with a fixed id; its sessions and orders are swept before and after the run (so a run that
// was killed halfway heals on the next one) and the restaurant's order counter is put back.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeGetPublicMenu } from "@/application/use-cases/get-public-menu";
import { makePlaceOrder } from "@/application/use-cases/orders/place-order";
import { makeGetPublicSession, makeJoinTableSession } from "@/application/use-cases/tables/join-table-session";
import { priceCart, type Cart, type CartCatalogEntry } from "@/domain/cart/cart";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { placeCustomerOrder } from "@/interface/web/customer/place-order-model";
import { createPublicClient, createServiceClient } from "./supabase/client";
import { SupabaseOrderRepository } from "./supabase/supabase-order-repository";
import { SupabaseOrderingCatalog } from "./supabase/supabase-ordering-catalog";
import { SupabasePublicMenuRepository } from "./supabase/supabase-public-menu-repository";
import { SupabaseRestaurantRepository } from "./supabase/supabase-restaurant-repository";
import { SupabaseTableSessionGateway } from "./supabase/supabase-table-session-gateway";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
const IT_TABLE = "c0ffee00-0000-4000-8000-0000000000ac";
const IT_TOKEN = "it-customer-order-token-0000001";
const enabled = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!enabled)("a guest places an order, against local Supabase", () => {
  const service = enabled ? createServiceClient() : (undefined as never);
  const anon = enabled ? createPublicClient() : (undefined as never);

  // What the server action is given by the container, built here from the same adapters.
  const gateway = () => new SupabaseTableSessionGateway(anon);
  const deps = () => ({
    findSession: makeGetPublicSession({ sessions: gateway() }),
    place: makePlaceOrder({
      orders: new SupabaseOrderRepository(service, service),
      catalog: new SupabaseOrderingCatalog(service),
      ids: { newId: () => crypto.randomUUID() },
      clock: { now: () => new Date() },
    }),
  });
  const restaurantOf = async (slug: string) => (await new SupabaseRestaurantRepository(anon).findPublicBySlug(slug))!;
  const scan = async () => (await makeJoinTableSession({ sessions: gateway() })({ slug: "demo-dinein", token: IT_TOKEN }))!;
  const ordersOfTable = async () => {
    const { data: sessions } = await service.from("table_sessions").select("id").eq("table_id", IT_TABLE);
    const ids = (sessions ?? []).map((s) => s.id as string);
    const { data } = ids.length ? await service.from("orders").select("id").in("session_id", ids) : { data: [] };
    return { sessionIds: ids, orderIds: (data ?? []).map((o) => o.id as string) };
  };

  async function sweep() {
    const { sessionIds, orderIds } = await ordersOfTable();
    if (orderIds.length) await service.from("orders").delete().in("id", orderIds); // lines + options cascade
    if (sessionIds.length) await service.from("table_sessions").delete().in("id", sessionIds);
    await service.from("restaurant_tables").delete().eq("id", IT_TABLE);
    const { data } = await service.from("orders").select("number").eq("restaurant_id", GRILL).order("number", { ascending: false }).limit(1);
    await service.from("order_counters").upsert({ restaurant_id: GRILL, last_number: data?.[0]?.number ?? 0 });
  }

  beforeAll(async () => {
    await sweep();
    const { error } = await service.from("restaurant_tables").insert({ id: IT_TABLE, restaurant_id: GRILL, label: "IT-customer-order", token: IT_TOKEN });
    if (error) throw error;
  });
  afterAll(sweep);

  it("scan -> cart preview -> place: staff see a NEW order whose totals equal the preview, to the fils", async () => {
    const grill = await restaurantOf("demo-dinein");
    const session = await scan();
    expect(session.status).toBe("OPEN");

    // The cart as the browser holds it, built from the PUBLIC menu: 2 x Kebab (Large + Garlic sauce).
    const menu = await makeGetPublicMenu({ menu: new SupabasePublicMenuRepository(anon) })({ id: grill.id, slug: grill.slug });
    const entries = menu.sections.flatMap(({ category, items }) => items.map((i) => ({ ...i, category })));
    const kebab = entries.find((e) => e.item.name.en === "Kebab")!;
    const optionIds = kebab.groups.flatMap(({ options }) => options.filter((o) => ["Large", "Garlic sauce"].includes(o.name.en)).map((o) => o.id));
    expect(optionIds).toHaveLength(2);
    const cart: Cart = { lines: [{ key: "k", menuItemId: kebab.item.id, optionIds, quantity: 2 }] };
    const rates = { taxRateBp: grill.settings.taxRateBp, serviceChargeBp: grill.settings.serviceChargeBp };
    const preview = priceCart(cart, new Map<string, CartCatalogEntry>(entries.map((e) => [e.item.id as string, e])), rates);
    // Computed by hand from the seed: (4.500 + 2.000 + 0.250) x 2, 10% service, 16% tax on both.
    expect(preview).toMatchObject({ canCheckout: true, subtotalFils: 13500, serviceChargeFils: 1350, taxFils: 2376, totalFils: 17226 });

    // JSON round trip, as the cart arrives from a browser.
    const outcome = await placeCustomerOrder(deps(), { restaurant: grill, sessionId: session.sessionId, cart: JSON.parse(JSON.stringify(cart)) });
    if (!outcome.ok) throw new Error(outcome.problem);

    // The waiter, signed in, finds it in this table's session exactly as previewed.
    const waiterDb = createPublicClient();
    const { error } = await waiterDb.auth.signInWithPassword({ email: "waiter@demo-dinein.test", password: PASSWORD });
    if (error) throw error;
    const [order, ...others] = await new SupabaseOrderRepository(waiterDb).listBySession(GRILL, session.sessionId);
    expect(others).toEqual([]);
    expect(order).toMatchObject({
      number: outcome.orderNumber,
      status: "NEW",
      subtotalFils: preview.subtotalFils,
      serviceChargeFils: preview.serviceChargeFils,
      taxFils: preview.taxFils,
      totalFils: preview.totalFils,
      ...rates,
    });
    expect(order!.items.map((i) => [i.name.en, i.quantity, i.lineTotalFils])).toEqual([["Kebab", 2, preview.lines[0]!.lineTotalFils]]);
    expect(order!.items[0]!.options.map((o) => o.name.en).sort()).toEqual(["Garlic sauce", "Large"]);
  });

  it("refuses another restaurant's session, a visit waiting for the bill and a closed one, storing nothing", async () => {
    const grill = await restaurantOf("demo-dinein");
    const coffee = await restaurantOf("demo-takeout");
    const session = await scan(); // the same live visit as above
    const { data: hummus } = await service.from("menu_items").select("id").eq("restaurant_id", GRILL).eq("name_en", "Hummus").single();
    const cart = { lines: [{ menuItemId: hummus!.id, optionIds: [], quantity: 1 }] };
    const before = (await ordersOfTable()).orderIds.length;
    const attempt = (restaurant: typeof grill) => placeCustomerOrder(deps(), { restaurant, sessionId: session.sessionId, cart });

    // Demo Coffee has dine-in off; and even if it were on, a Grill session is not Coffee's.
    expect(await attempt(coffee)).toEqual({ ok: false, problem: "orderingOff" });
    expect(await attempt({ ...coffee, settings: { ...coffee.settings, dineInEnabled: true } })).toEqual({ ok: false, problem: "noTable" });

    for (const [status, problem] of [["PAYMENT_REQUESTED", "paymentRequested"], ["CLOSED", "sessionEnded"]] as const) {
      const { error } = await service.from("table_sessions").update({ status }).eq("id", session.sessionId);
      if (error) throw error;
      expect(await attempt(grill)).toEqual({ ok: false, problem });
    }
    expect((await ordersOfTable()).orderIds).toHaveLength(before);

    // Scanning again after the visit closed starts a fresh one, and ordering works again.
    const fresh = await scan();
    expect(fresh.sessionId).not.toBe(session.sessionId);
    expect(await placeCustomerOrder(deps(), { restaurant: grill, sessionId: fresh.sessionId, cart })).toMatchObject({ ok: true });
  });
});
