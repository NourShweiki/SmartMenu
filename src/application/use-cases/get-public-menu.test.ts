import { describe, expect, it } from "vitest";
import type { PublicMenuRepository, PublicMenuSection } from "@/application/ports/public-menu-repository";
import { createCategory, createMenuItem, setItemHidden, setItemSoldOut, type MenuCategory, type MenuItem } from "@/domain/menu/menu";
import { createOption, createOptionGroup, deleteOption } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { makeGetPublicMenu } from "./get-public-menu";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const NOW = new Date("2026-10-10T12:00:00Z");
let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const category = (en: string): MenuCategory => unwrap(createCategory(R, { name: { en, ar: en }, sortOrder: 0 }, ids));
const item = (cat: MenuCategory, en: string): MenuItem =>
  unwrap(createMenuItem(cat, { name: { en, ar: en }, description: { en: "", ar: "" }, priceFils: 1000, sortOrder: 0 }, ids));
const repo = (sections: PublicMenuSection[]): PublicMenuRepository => ({ findForRestaurant: async () => sections });
const run = (sections: PublicMenuSection[]) => makeGetPublicMenu({ menu: repo(sections) })({ id: R, slug: "demo" });

describe("getPublicMenu", () => {
  it("returns the sections and items in the order given, each marked orderable", async () => {
    const mains = category("Mains");
    const menu = await run([{ category: mains, items: [{ item: item(mains, "Kebab"), groups: [] }, { item: item(mains, "Hummus"), groups: [] }] }]);
    expect(menu.sections.map((s) => s.category.name.en)).toEqual(["Mains"]);
    expect(menu.sections[0]!.items.map((i) => [i.item.name.en, i.orderable])).toEqual([["Kebab", true], ["Hummus", true]]);
  });

  it("shows a sold-out item but does not let it be ordered", async () => {
    const mains = category("Mains");
    const soldOut = unwrap(setItemSoldOut(item(mains, "Tawook"), true));
    const menu = await run([{ category: mains, items: [{ item: soldOut, groups: [] }] }]);
    expect(menu.sections[0]!.items[0]).toMatchObject({ orderable: false });
    expect(menu.sections[0]!.items[0]!.item.isSoldOut).toBe(true);
  });

  it("does not show an item the owner hid, even if the data source returned it (defence in depth)", async () => {
    const mains = category("Mains");
    const hidden = unwrap(setItemHidden(item(mains, "Secret"), true));
    const deleted = { ...item(mains, "Gone"), deletedAt: NOW };
    const menu = await run([{ category: mains, items: [{ item: hidden, groups: [] }, { item: deleted, groups: [] }, { item: item(mains, "Kebab"), groups: [] }] }]);
    expect(menu.sections[0]!.items.map((i) => i.item.name.en)).toEqual(["Kebab"]);
  });

  it("drops categories that are hidden, deleted or left with no items", async () => {
    const empty = category("Empty");
    const hiddenCat = { ...category("Hidden"), isHidden: true };
    const liveCat = category("Deleted");
    const deletedCat = { ...liveCat, deletedAt: NOW };
    const itemInDeletedCat = item(liveCat, "b"); // built while the category was still live
    const only = category("Only hidden items");
    const hiddenItem = unwrap(setItemHidden(item(only, "x"), true));
    const menu = await run([
      { category: empty, items: [] },
      { category: hiddenCat, items: [{ item: item(hiddenCat, "a"), groups: [] }] },
      { category: deletedCat, items: [{ item: itemInDeletedCat, groups: [] }] },
      { category: only, items: [{ item: hiddenItem, groups: [] }] },
    ]);
    expect(menu.sections).toEqual([]);
  });

  it("cannot order an item whose required option group has too few live options", async () => {
    const mains = category("Mains");
    const size = unwrap(createOptionGroup(R, { name: { en: "Size", ar: "الحجم" }, minSelect: 1, maxSelect: 1, sortOrder: 0 }, ids));
    const large = unwrap(createOption(size, { name: { en: "Large", ar: "كبير" }, priceDeltaFils: 500, sortOrder: 0 }, ids));
    const optional = unwrap(createOptionGroup(R, { name: { en: "Extras", ar: "إضافات" }, minSelect: 0, maxSelect: 2, sortOrder: 1 }, ids));

    const fine = await run([{ category: mains, items: [{ item: item(mains, "A"), groups: [{ group: size, options: [large] }, { group: optional, options: [] }] }] }]);
    expect(fine.sections[0]!.items[0]!.orderable).toBe(true); // an optional group may be empty

    const broken = await run([
      { category: mains, items: [{ item: item(mains, "B"), groups: [{ group: size, options: [unwrap(deleteOption(large, NOW))] }] }] },
    ]);
    expect(broken.sections[0]!.items[0]!.orderable).toBe(false); // required, but nothing left to choose
  });
});
