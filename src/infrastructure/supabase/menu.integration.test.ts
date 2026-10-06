// Runs the real menu adapter against the LOCAL Supabase (seeded demo menu + staff).
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// Rows it creates are soft-deleted at the end, so the demo menu looks unchanged.
import { describe, expect, it } from "vitest";
import { createCategory, createMenuItem, deleteCategory, deleteMenuItem, type CategoryId, type MenuItemId } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient } from "./client";
import { makeRemoveMenuItemPhoto, makeSetMenuItemPhoto } from "@/application/use-cases/menu/set-menu-item-photo";
import { SupabaseMenuRepository } from "./supabase-menu-repository";
import { SupabasePhotoStorage } from "./supabase-photo-storage";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const GRILLS = "c1000000-0000-4000-8000-000000000001" as CategoryId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql

async function signedInClient(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return db;
}
const signedInRepo = async (email: string) => new SupabaseMenuRepository(await signedInClient(email));

describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("menu repository against local Supabase", () => {
  it("lists only the signed-in owner's restaurant menu, in order", async () => {
    const repo = await signedInRepo("owner@demo-dinein.test");
    const categories = await repo.listCategories(GRILL);
    expect(categories.map((c) => c.name.en).slice(0, 3)).toEqual(["Grills", "Appetizers", "Drinks"]);
    const items = await repo.listItems(GRILL);
    // Prices come back as whole fils (not the exact seed value: the demo menu may have been edited).
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(Number.isInteger(i.priceFils)).toBe(true);
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
    const deletedCat = deleteCategory(cat.value, 0, now) // its only item was deleted above;
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
    expect(await waiter.setItemSoldOut(GRILL, "not-a-uuid" as MenuItemId, true)).toBe(false);
    expect(await waiter.findCategory(GRILL, "abc" as CategoryId)).toBeNull(); // no Postgres error
  });

  it("uploads a real photo, serves it publicly, then removes it", async () => {
    const db = await signedInClient("owner@demo-dinein.test");
    const deps = { menu: new SupabaseMenuRepository(db), photos: new SupabasePhotoStorage(db), ids: { newId: () => crypto.randomUUID() } };
    const item = (await deps.menu.listItems(GRILL))[0];
    if (!item) throw new Error("no seed items");
    // 1x1 transparent PNG
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
    const actor = { restaurantId: GRILL, role: "OWNER" as const };

    const set = await makeSetMenuItemPhoto(deps)(actor, { itemId: item.id, bytes: png });
    if (!set.ok) throw new Error(JSON.stringify(set.error));
    const res = await fetch(deps.photos.publicUrl(set.value.imagePath!));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");

    const removed = await makeRemoveMenuItemPhoto(deps)(actor, { itemId: item.id });
    expect(removed.ok && removed.value.imagePath).toBeNull();
    expect((await fetch(deps.photos.publicUrl(set.value.imagePath!))).status).not.toBe(200);
  });

  it("does not let a waiter upload to storage directly", async () => {
    const photos = new SupabasePhotoStorage(await signedInClient("waiter@demo-dinein.test"));
    await expect(photos.upload(`${GRILL}/x/y.png`, new Uint8Array([0x89, 0x50]), "image/png")).rejects.toThrow();
  });
});
