// The public menu against the LOCAL Supabase, as an ANONYMOUS visitor (no login at all).
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI. Read-only.
import { describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { makeGetPublicMenu } from "@/application/use-cases/get-public-menu";
import { createPublicClient } from "./client";
import { SupabasePublicMenuRepository } from "./supabase-public-menu-repository";

const GRILL = { id: "11111111-1111-4000-8000-000000000001" as RestaurantId, slug: "demo-dinein" };
const COFFEE = { id: "22222222-2222-4000-8000-000000000002" as RestaurantId, slug: "demo-takeout" };

describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("public menu against local Supabase (anonymous)", () => {
  // Built per call, not at load time: this file is also loaded (and skipped) where there is no database configured.
  const getMenu = (restaurant: { id: RestaurantId; slug: string }) =>
    makeGetPublicMenu({ menu: new SupabasePublicMenuRepository(createPublicClient()) })(restaurant);
  const allItems = (menu: Awaited<ReturnType<typeof getMenu>>) => menu.sections.flatMap((s) => s.items);

  it("shows Demo Grill's visible menu with option groups, and marks the sold-out item as not orderable", async () => {
    const menu = await getMenu(GRILL);
    const items = allItems(menu);
    expect(menu.sections.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);
    for (const { item } of items) {
      expect(item.restaurantId).toBe(GRILL.id);
      expect(Number.isInteger(item.priceFils)).toBe(true);
    }

    const kebab = items.find((i) => i.item.name.en === "Kebab");
    expect(kebab?.orderable).toBe(true);
    expect(kebab!.groups.map((g) => g.group.name.en).sort()).toEqual(["Extras", "Size"]);
    const size = kebab!.groups.find((g) => g.group.name.en === "Size")!;
    expect(size.group).toMatchObject({ minSelect: 1, maxSelect: 1 });
    expect(size.options.length).toBeGreaterThan(1);

    const tawook = items.find((i) => i.item.name.en === "Shish tawook"); // seeded as sold out
    expect(tawook).toBeDefined();
    expect(tawook!.item.isSoldOut).toBe(true);
    expect(tawook!.orderable).toBe(false);
  });

  it("shows Demo Coffee's own menu and never the Grill's", async () => {
    const coffee = allItems(await getMenu(COFFEE));
    const grill = allItems(await getMenu(GRILL));
    expect(coffee.map((i) => i.item.name.en)).toContain("Cappuccino");
    expect(coffee.every((i) => i.item.restaurantId === COFFEE.id)).toBe(true);
    const grillIds = new Set(grill.map((i) => i.item.id));
    expect(coffee.some((i) => grillIds.has(i.item.id))).toBe(false);
    expect(grill.map((i) => i.item.name.en)).not.toContain("Cappuccino");
  });

  it("returns an empty menu for an unknown restaurant, and exposes no table to anonymous visitors", async () => {
    expect((await getMenu({ id: GRILL.id, slug: "no-such-place" })).sections).toEqual([]);
    const { error } = await createPublicClient().from("menu_items").select("id").limit(1);
    expect(error?.code).toBe("42501"); // anon has no direct table access: only the public function
  });
});
