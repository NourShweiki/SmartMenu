import { describe, expect, it } from "vitest";
import type { MenuRepository } from "@/application/ports/menu-repository";
import type { CategoryId, MenuCategory, MenuItem, MenuItemId } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import type { Fils } from "@/domain/shared/money";
import { makeAddMenuCategory } from "./add-menu-category";
import { makeAddMenuItem } from "./add-menu-item";
import { makeDeleteMenuItem } from "./delete-menu-item";
import { makeEditMenuItem } from "./edit-menu-item";
import { makeGetStaffMenu } from "./get-staff-menu";
import { makeSetMenuItemHidden } from "./set-menu-item-hidden";
import { makeSetMenuItemSoldOut } from "./set-menu-item-sold-out";

const GRILL = "grill" as RestaurantId;
const COFFEE = "coffee" as RestaurantId;
const NOW = new Date("2026-10-06T12:00:00Z");

const category = (id: string, restaurantId: RestaurantId, sortOrder = 0): MenuCategory => ({
  id: id as CategoryId,
  restaurantId,
  name: { en: id, ar: id },
  sortOrder,
  isHidden: false,
  deletedAt: null,
});
const item = (id: string, cat: MenuCategory): MenuItem => ({
  id: id as MenuItemId,
  restaurantId: cat.restaurantId,
  categoryId: cat.id,
  name: { en: id, ar: id },
  description: { en: "", ar: "" },
  priceFils: 1000 as Fils,
  sortOrder: 0,
  isHidden: false,
  isSoldOut: false,
  deletedAt: null,
});

/** In-memory MenuRepository that, like RLS, never crosses restaurants. */
function fakeMenu() {
  const grills = category("grills", GRILL);
  const drinks = category("drinks", GRILL, 1);
  const hot = category("hot", COFFEE);
  const state = {
    categories: [grills, drinks, hot],
    items: [item("kebab", grills), item("latte", hot)],
  };
  const live = <T extends { restaurantId: RestaurantId; deletedAt: Date | null }>(rows: T[], r: RestaurantId) =>
    rows.filter((x) => x.restaurantId === r && !x.deletedAt);
  const repo: MenuRepository = {
    async listCategories(r) { return live(state.categories, r); },
    async listItems(r) { return live(state.items, r); },
    async findCategory(r, id) { return state.categories.find((c) => c.restaurantId === r && c.id === id) ?? null; },
    async findItem(r, id) { return state.items.find((i) => i.restaurantId === r && i.id === id) ?? null; },
    async insertCategory(c) { state.categories.push(c); },
    async updateCategory(c) { state.categories = state.categories.map((x) => (x.id === c.id ? c : x)); },
    async insertItem(i) { state.items.push(i); },
    async updateItem(i) { state.items = state.items.map((x) => (x.id === i.id ? i : x)); },
    async setItemSoldOut(r, id, isSoldOut) {
      const found = state.items.find((i) => i.restaurantId === r && i.id === id && !i.deletedAt);
      if (!found) return false;
      await repo.updateItem({ ...found, isSoldOut });
      return true;
    },
  };
  return { repo, state };
}

let n = 0;
const deps = () => {
  const { repo, state } = fakeMenu();
  return { state, menu: repo, ids: { newId: () => `new-${++n}` }, clock: { now: () => NOW } };
};
const actor = (role: Role, restaurantId = GRILL) => ({ restaurantId, role });
const newItem = { name: { en: "Hummus", ar: "حمص" }, description: { en: "", ar: "" }, priceFils: 1250, sortOrder: 1 };

describe("getStaffMenu", () => {
  it("groups the actor's restaurant menu by category and reports what they may do", async () => {
    const d = deps();
    const owner = await makeGetStaffMenu(d)(actor("OWNER"));
    expect(owner.sections.map((s) => [s.category.id, s.items.map((i) => i.id)])).toEqual([
      ["grills", ["kebab"]],
      ["drinks", []],
    ]);
    expect(owner).toMatchObject({ canManage: true, canToggleSoldOut: true });
    expect(await makeGetStaffMenu(d)(actor("WAITER"))).toMatchObject({ canManage: false, canToggleSoldOut: true });
    expect(await makeGetStaffMenu(d)(actor("CASHIER"))).toMatchObject({ canManage: false, canToggleSoldOut: false });
  });
});

describe("adding to the menu", () => {
  it("lets a manager add a category and an item", async () => {
    const d = deps();
    const cat = await makeAddMenuCategory(d)(actor("MANAGER"), { name: { en: "Sweets", ar: "حلويات" }, sortOrder: 2 });
    expect(cat.ok && cat.value.restaurantId).toBe(GRILL);
    const added = await makeAddMenuItem(d)(actor("MANAGER"), { ...newItem, categoryId: "grills" as CategoryId });
    expect(added.ok && added.value).toMatchObject({ restaurantId: GRILL, categoryId: "grills", priceFils: 1250 });
    expect(d.state.items).toHaveLength(3);
  });

  it("forbids waiters and cashiers from adding", async () => {
    const d = deps();
    for (const role of ["WAITER", "CASHIER"] as const) {
      expect(await makeAddMenuItem(d)(actor(role), { ...newItem, categoryId: "grills" as CategoryId })).toEqual({
        ok: false,
        error: { type: "FORBIDDEN" },
      });
    }
    expect(d.state.items).toHaveLength(2);
  });

  it("cannot add an item to another restaurant's category", async () => {
    const d = deps();
    expect(await makeAddMenuItem(d)(actor("OWNER"), { ...newItem, categoryId: "hot" as CategoryId })).toEqual({
      ok: false,
      error: { type: "CATEGORY_NOT_FOUND" },
    });
  });

  it("passes domain validation errors through and saves nothing", async () => {
    const d = deps();
    const result = await makeAddMenuItem(d)(actor("OWNER"), { ...newItem, priceFils: 12.5, categoryId: "grills" as CategoryId });
    expect(result).toEqual({ ok: false, error: { type: "INVALID_PRICE" } });
    expect(d.state.items).toHaveLength(2);
  });
});

describe("changing items", () => {
  it("edits price and moves category", async () => {
    const d = deps();
    const result = await makeEditMenuItem(d)(actor("OWNER"), {
      ...newItem,
      itemId: "kebab" as MenuItemId,
      categoryId: "drinks" as CategoryId,
      priceFils: 5000,
    });
    expect(result.ok && result.value).toMatchObject({ categoryId: "drinks", priceFils: 5000 });
  });

  it("cannot touch another restaurant's item", async () => {
    const d = deps();
    const input = { ...newItem, itemId: "latte" as MenuItemId, categoryId: "grills" as CategoryId };
    expect(await makeEditMenuItem(d)(actor("OWNER"), input)).toEqual({ ok: false, error: { type: "ITEM_NOT_FOUND" } });
    expect(await makeSetMenuItemSoldOut(d)(actor("WAITER"), { itemId: "latte" as MenuItemId, isSoldOut: true })).toEqual({
      ok: false,
      error: { type: "ITEM_NOT_FOUND" },
    });
  });

  it("lets waiters mark sold out but not hide", async () => {
    const d = deps();
    expect(await makeSetMenuItemSoldOut(d)(actor("WAITER"), { itemId: "kebab" as MenuItemId, isSoldOut: true })).toEqual({
      ok: true,
      value: true,
    });
    expect(d.state.items.find((i) => i.id === "kebab")?.isSoldOut).toBe(true);
    expect(await makeSetMenuItemHidden(d)(actor("WAITER"), { itemId: "kebab" as MenuItemId, isHidden: true })).toEqual({
      ok: false,
      error: { type: "FORBIDDEN" },
    });
    expect(await makeSetMenuItemSoldOut(d)(actor("CASHIER"), { itemId: "kebab" as MenuItemId, isSoldOut: false })).toEqual({
      ok: false,
      error: { type: "FORBIDDEN" },
    });
  });

  it("soft-deletes with the clock's time, after which the item is gone from the menu", async () => {
    const d = deps();
    const result = await makeDeleteMenuItem(d)(actor("OWNER"), { itemId: "kebab" as MenuItemId });
    expect(result.ok && result.value.deletedAt).toEqual(NOW);
    const menu = await makeGetStaffMenu(d)(actor("OWNER"));
    expect(menu.sections[0]?.items).toEqual([]);
  });
});
