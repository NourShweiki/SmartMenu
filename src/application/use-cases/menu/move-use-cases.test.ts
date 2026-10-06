import { describe, expect, it } from "vitest";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { OptionsRepository } from "@/application/ports/options-repository";
import type { CategoryId, MenuCategory, MenuItem, MenuItemId } from "@/domain/menu/menu";
import type { MenuOption, OptionGroupId, OptionId } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Fils } from "@/domain/shared/money";
import { makeMoveMenuCategory } from "./move-menu-category";
import { makeMoveMenuItem } from "./move-menu-item";
import { makeMoveOption } from "./options/move-option";

const GRILL = "grill" as RestaurantId;
const COFFEE = "coffee" as RestaurantId;
const byOrder = <T extends { sortOrder: number }>(rows: T[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

function fakeMenu() {
  const cat = (id: string, restaurantId: RestaurantId, sortOrder: number): MenuCategory => ({
    id: id as CategoryId, restaurantId, name: { en: id, ar: id }, sortOrder, isHidden: false, deletedAt: null,
  });
  const item = (id: string, categoryId: string, restaurantId: RestaurantId, sortOrder: number): MenuItem => ({
    id: id as MenuItemId, restaurantId, categoryId: categoryId as CategoryId, name: { en: id, ar: id },
    description: { en: "", ar: "" }, priceFils: 100 as Fils, sortOrder, isHidden: false, isSoldOut: false,
    imagePath: null, deletedAt: null,
  });
  const state = {
    categories: [cat("grills", GRILL, 0), cat("drinks", GRILL, 1), cat("hot", COFFEE, 0)],
    items: [
      item("kebab", "grills", GRILL, 0),
      item("tawook", "grills", GRILL, 1),
      item("lemonade", "drinks", GRILL, 0),
      item("latte", "hot", COFFEE, 0),
    ],
  };
  const menu = {
    async listCategories(r: RestaurantId) { return byOrder(state.categories.filter((c) => c.restaurantId === r)); },
    async listItems(r: RestaurantId) { return byOrder(state.items.filter((i) => i.restaurantId === r)); },
    async updateCategory(c: MenuCategory) { state.categories = state.categories.map((x) => (x.id === c.id ? c : x)); },
    async updateItem(i: MenuItem) { state.items = state.items.map((x) => (x.id === i.id ? i : x)); },
  } as unknown as MenuRepository;
  return { state, menu };
}

const owner = { restaurantId: GRILL, role: "OWNER" as const };
const waiter = { restaurantId: GRILL, role: "WAITER" as const };
const order = (rows: { id: string; sortOrder: number }[]) => byOrder(rows).map((r) => r.id);

describe("moving categories and items", () => {
  it("moves a category down", async () => {
    const d = fakeMenu();
    expect(await makeMoveMenuCategory(d)(owner, { categoryId: "grills" as CategoryId, direction: "down" })).toEqual({ ok: true, value: true });
    expect(order(d.state.categories.filter((c) => c.restaurantId === GRILL))).toEqual(["drinks", "grills"]);
  });

  it("moves an item only within its own category", async () => {
    const d = fakeMenu();
    await makeMoveMenuItem(d)(owner, { itemId: "tawook" as MenuItemId, direction: "up" });
    expect(order(d.state.items.filter((i) => i.categoryId === "grills"))).toEqual(["tawook", "kebab"]);
    expect(d.state.items.find((i) => i.id === "lemonade")?.sortOrder).toBe(0); // other category untouched
    // Already first in its category: nothing changes.
    await makeMoveMenuItem(d)(owner, { itemId: "lemonade" as MenuItemId, direction: "up" });
    expect(d.state.items.find((i) => i.id === "lemonade")?.sortOrder).toBe(0);
  });

  it("refuses waiters and another restaurant's rows", async () => {
    const d = fakeMenu();
    expect(await makeMoveMenuItem(d)(waiter, { itemId: "kebab" as MenuItemId, direction: "down" })).toEqual({
      ok: false,
      error: { type: "FORBIDDEN" },
    });
    expect(await makeMoveMenuCategory(d)(owner, { categoryId: "hot" as CategoryId, direction: "up" })).toEqual({
      ok: false,
      error: { type: "CATEGORY_NOT_FOUND" },
    });
    expect(await makeMoveMenuItem(d)(owner, { itemId: "latte" as MenuItemId, direction: "up" })).toEqual({
      ok: false,
      error: { type: "ITEM_NOT_FOUND" },
    });
  });
});

describe("moving options", () => {
  it("reorders options within their group", async () => {
    const opt = (id: string, groupId: string, sortOrder: number): MenuOption => ({
      id: id as OptionId, restaurantId: GRILL, groupId: groupId as OptionGroupId, name: { en: id, ar: id },
      priceDeltaFils: 0 as Fils, sortOrder, deletedAt: null,
    });
    let rows = [opt("small", "size", 0), opt("large", "size", 1), opt("medium", "size", 2), opt("bread", "extras", 0)];
    const options = {
      async listOptions() { return byOrder(rows); },
      async updateOption(o: MenuOption) { rows = rows.map((x) => (x.id === o.id ? o : x)); },
    } as unknown as OptionsRepository;

    await makeMoveOption({ options })(owner, { optionId: "medium" as OptionId, direction: "up" });
    expect(order(rows.filter((o) => o.groupId === "size"))).toEqual(["small", "medium", "large"]);
    expect(rows.find((o) => o.id === "bread")?.sortOrder).toBe(0);
  });
});
