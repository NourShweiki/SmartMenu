// Runs the real menu adapter against the LOCAL Supabase (seeded demo menu + staff).
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// Rows it creates are soft-deleted at the end, so the demo menu looks unchanged.
import { describe, expect, it } from "vitest";
import { createCategory, createMenuItem, deleteCategory, deleteMenuItem, type CategoryId, type MenuItemId } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient } from "./client";
import { SupabaseMenuRepository } from "./supabase-menu-repository";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const GRILLS = "c1000000-0000-4000-8000-000000000001" as CategoryId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql

async function signedInRepo(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return new SupabaseMenuRepository(db);
}

describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("menu repository against local Supabase", () => {
  it("lists only the signed-in owner's restaurant menu, in order", async () => {
    const repo = await signedInRepo("owner@demo-dinein.test");
    const categories = await repo.listCategories(GRILL);
    expect(categories.map((c) => c.name.en).slice(0, 3)).toEqual(["Grills", "Appetizers", "Drinks"]);
    const items = await repo.listItems(GRILL);
    expect(items.find((i) => i.name.en === "Kebab")?.priceFils).toBe(4500);
    expect(await repo.listItems(COFFEE)).toEqual([]); // RLS: not their restaurant
  });

  it("inserts, updates and soft-deletes a category and item", async () => {
    const repo = await signedInRepo("owner@demo-dinein.test");
    const newId = () => crypto.randomUUID();
    const cat = createCategory(GRILL, { name: { en: "Test cat", ar: "فئة تجربة" }, sortOrder: 99 }, { newId });
    if (!cat.ok) throw new Error("category");
    await repo.insertCategory(cat.value);

    const item = createMenuItem(cat.value, { name: { en: "Test", ar: "تجربة" }, description: { en: "", ar: "" }, priceFils: 0, sortOrder: 0 }, { newId });
    if (!item.ok) throw new Error("item");
    await repo.insertItem(item.value);
    await repo.updateItem({ ...item.value, priceFils: 2750 as never });
    expect((await repo.findItem(GRILL, item.value.id))?.priceFils).toBe(2750);

    const now = new Date();
    const deletedItem = deleteMenuItem(item.value, now);
    const deletedCat = deleteCategory(cat.value, now);
    if (!deletedItem.ok || !deletedCat.ok) throw new Error("delete");
    await repo.updateItem(deletedItem.value);
    await repo.updateCategory(deletedCat.value);
    expect((await repo.listItems(GRILL)).some((i) => i.id === item.value.id)).toBe(false);
  });

  it("lets a waiter toggle sold out but not for another restaurant", async () => {
    const waiter = await signedInRepo("waiter@demo-dinein.test");
    const kebab = (await waiter.listItems(GRILL)).find((i) => i.categoryId === GRILLS && i.name.en === "Kebab");
    if (!kebab) throw new Error("seed kebab missing");
    expect(await waiter.setItemSoldOut(GRILL, kebab.id, true)).toBe(true);
    expect((await waiter.findItem(GRILL, kebab.id))?.isSoldOut).toBe(true);
    expect(await waiter.setItemSoldOut(GRILL, kebab.id, false)).toBe(true); // restore
    expect(await waiter.setItemSoldOut(COFFEE, kebab.id, true)).toBe(false); // wrong restaurant
    expect(await waiter.setItemSoldOut(GRILL, crypto.randomUUID() as MenuItemId, true)).toBe(false);
  });
});
