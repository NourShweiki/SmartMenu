import { describe, expect, it } from "vitest";
import type { MenuRepository } from "@/application/ports/menu-repository";
import { createCategory, createMenuItem, type MenuCategory, type MenuItem } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import { makeImportMenu, MAX_IMPORT_ROWS, type MenuImportRow } from "./import-menu";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const actor = (role: Role) => ({ restaurantId: R, role });
const row = (category: string, name: string, priceFils = 1000, ar = "ع"): MenuImportRow => ({
  category: { en: category, ar: `${ar} ${category}` },
  name: { en: name, ar: `${ar} ${name}` },
  description: { en: "", ar: "" },
  priceFils,
});

/** A menu that already has "Starters" with "Hummus" in it. */
function world(options: { failOnItem?: number } = {}) {
  const starters = unwrap(createCategory(R, { name: { en: "Starters", ar: "المقبلات" }, sortOrder: 3 }, ids));
  const hummus = unwrap(createMenuItem(starters, { name: { en: "Hummus", ar: "حمص" }, description: { en: "", ar: "" }, priceFils: 1250, sortOrder: 7 }, ids));
  const state = { categories: [starters] as MenuCategory[], items: [hummus] as MenuItem[], writes: 0 };
  const menu = {
    listCategories: async () => [...state.categories],
    listItems: async () => [...state.items],
    insertCategory: async (category: MenuCategory) => {
      state.categories.push(category);
    },
    insertItem: async (item: MenuItem) => {
      if (options.failOnItem !== undefined && state.writes++ === options.failOnItem) throw new Error("database is down");
      state.items.push(item);
    },
  } as unknown as MenuRepository;
  return { run: makeImportMenu({ menu, ids }), state, starters };
}

describe("importMenu", () => {
  it("adds items to existing and new categories, at the end and in the order of the rows", async () => {
    const { run, state, starters } = world();
    const result = await run(actor("OWNER"), [row("starters", "Mutabbal"), row("Grills", "Kebab", 4500), row(" GRILLS ", "Shish"), row("Drinks", "Tea")]);
    expect(result).toEqual({ ok: true, value: { categoriesAdded: 2, itemsAdded: 4, itemsSkipped: 0 } });

    expect(state.categories.map((c) => [c.name.en, c.sortOrder])).toEqual([["Starters", 3], ["Grills", 4], ["Drinks", 5]]);
    const inCategory = (name: string) => {
      const category = state.categories.find((c) => c.name.en === name)!;
      return state.items.filter((i) => i.categoryId === category.id).map((i) => [i.name.en, i.sortOrder, i.priceFils]);
    };
    expect(inCategory("Starters")).toEqual([["Hummus", 7, 1250], ["Mutabbal", 8, 1000]]);
    expect(inCategory("Grills")).toEqual([["Kebab", 0, 4500], ["Shish", 1, 1000]]);
    expect(state.items.find((i) => i.name.en === "Mutabbal")?.categoryId).toBe(starters.id); // matched whatever the case
  });

  it("skips what is already there, so the same file can be imported twice", async () => {
    const { run, state } = world();
    const file = [row("Starters", "hummus", 9999), row("Grills", "Kebab"), row("Grills", "KEBAB")];
    expect(await run(actor("MANAGER"), file)).toEqual({ ok: true, value: { categoriesAdded: 1, itemsAdded: 1, itemsSkipped: 2 } });
    expect(state.items.find((i) => i.name.en === "Hummus")?.priceFils).toBe(1250); // the existing item is not changed
    expect(await run(actor("MANAGER"), file)).toEqual({ ok: true, value: { categoriesAdded: 0, itemsAdded: 0, itemsSkipped: 3 } });
    expect(state.items).toHaveLength(2);
  });

  it("checks every row first: one bad row refuses the whole file and names the row", async () => {
    const { run, state } = world();
    const refused = await run(actor("OWNER"), [row("Grills", "Kebab"), row("Grills", "Shish", -5), row("Drinks", "Tea")]);
    expect(refused).toEqual({ ok: false, error: { type: "ROW_INVALID", row: 2, error: { type: "INVALID_PRICE" } } });
    const noArabic = await run(actor("OWNER"), [{ ...row("Sweets", "Knafeh"), category: { en: "Sweets", ar: " " } }]);
    expect(noArabic).toEqual({ ok: false, error: { type: "ROW_INVALID", row: 1, error: { type: "NAME_REQUIRED", lang: "ar" } } });
    expect(state.categories).toHaveLength(1);
    expect(state.items).toHaveLength(1);
  });

  it("refuses an empty file, too many rows, and anybody who may not change the menu", async () => {
    const { run, state } = world();
    expect(await run(actor("OWNER"), [])).toEqual({ ok: false, error: { type: "EMPTY_IMPORT" } });
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => row("Grills", `Item ${i}`));
    expect(await run(actor("OWNER"), many)).toEqual({ ok: false, error: { type: "TOO_MANY_ROWS", max: MAX_IMPORT_ROWS } });
    for (const role of ["WAITER", "CASHIER"] as const) expect(await run(actor(role), [row("Grills", "Kebab")])).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(state.items).toHaveLength(1);
  });

  it("an import that breaks off half-way can simply be run again", async () => {
    const broken = world({ failOnItem: 1 });
    const file = [row("Grills", "Kebab"), row("Grills", "Shish"), row("Drinks", "Tea")];
    await expect(broken.run(actor("OWNER"), file)).rejects.toThrow("database is down");
    expect(broken.state.items.map((i) => i.name.en)).toEqual(["Hummus", "Kebab"]); // one made it
    const again = makeImportMenu({ menu: { ...({} as MenuRepository), listCategories: async () => broken.state.categories, listItems: async () => broken.state.items, insertCategory: async () => {}, insertItem: async (i: MenuItem) => void broken.state.items.push(i) } as MenuRepository, ids });
    expect(await again(actor("OWNER"), file)).toEqual({ ok: true, value: { categoriesAdded: 0, itemsAdded: 2, itemsSkipped: 1 } });
  });
});
