// Runs the real options adapter against the LOCAL Supabase (seeded demo options + staff).
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
import { describe, expect, it } from "vitest";
import type { OptionGroupId } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient } from "./client";
import { SupabaseMenuRepository } from "./supabase-menu-repository";
import { SupabaseOptionsRepository } from "./supabase-options-repository";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const SIZE = "09000000-0000-4000-8000-000000000001" as OptionGroupId;
const EXTRAS = "09000000-0000-4000-8000-000000000002" as OptionGroupId;
const MILK = "09000000-0000-4000-8000-000000000003" as OptionGroupId;

async function signedIn(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: "smartmenu-demo-2026" });
  if (error) throw error;
  return { options: new SupabaseOptionsRepository(db), menu: new SupabaseMenuRepository(db) };
}

describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("options repository against local Supabase", () => {
  it("lists only the owner's restaurant groups and options", async () => {
    const { options } = await signedIn("owner@demo-dinein.test");
    const groups = await options.listGroups(GRILL);
    expect(groups.map((g) => g.id)).toEqual(expect.arrayContaining([SIZE, EXTRAS]));
    expect(groups.some((g) => g.id === MILK)).toBe(false);
    expect((await options.listOptions(GRILL)).every((o) => Number.isInteger(o.priceDeltaFils))).toBe(true);
    expect(await options.listGroups(COFFEE)).toEqual([]); // RLS
  });

  it("re-sets an item's groups by difference and restores them", async () => {
    const { options, menu } = await signedIn("owner@demo-dinein.test");
    const hummus = (await menu.listItems(GRILL)).find((i) => i.name.en === "Hummus");
    if (!hummus) throw new Error("seed hummus missing");
    const linksOf = async () => (await options.listLinks(GRILL)).filter((l) => l.itemId === hummus.id).map((l) => l.groupId);

    await options.setItemGroups(GRILL, hummus.id, [EXTRAS, SIZE]);
    expect(await linksOf()).toEqual([EXTRAS, SIZE]);
    await options.setItemGroups(GRILL, hummus.id, [SIZE]);
    expect(await linksOf()).toEqual([SIZE]);
    await options.setItemGroups(GRILL, hummus.id, []); // back to the seed state
    expect(await linksOf()).toEqual([]);
  });

  it("cannot link a Grill item to a Coffee group", async () => {
    const { options, menu } = await signedIn("owner@demo-dinein.test");
    const item = (await menu.listItems(GRILL))[0]!;
    await expect(options.setItemGroups(GRILL, item.id, [MILK])).rejects.toThrow();
  });
});
