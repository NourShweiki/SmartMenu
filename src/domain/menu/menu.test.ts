import { describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { toFils } from "@/domain/shared/money";
import {
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  isOrderable,
  isVisibleToCustomers,
  MAX_NAME_LENGTH,
  setCategoryHidden,
  setItemHidden,
  setItemSoldOut,
  updateCategory,
  updateMenuItem,
  type MenuCategory,
  type MenuItem,
  type MenuItemInput,
} from "./menu";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
let n = 0;
const deps = { newId: () => `id-${++n}` };
const NOW = new Date("2026-10-06T10:00:00Z");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
}

const grills = (): MenuCategory => unwrap(createCategory(GRILL, { name: { en: "Grills", ar: "مشاوي" }, sortOrder: 0 }, deps));
const kebabInput: MenuItemInput = {
  name: { en: "Kebab", ar: "كباب" },
  description: { en: "", ar: "" },
  priceFils: 4500,
  sortOrder: 0,
};
const kebab = (cat = grills()): MenuItem => unwrap(createMenuItem(cat, kebabInput, deps));

describe("money", () => {
  it("accepts whole fils only", () => {
    expect(toFils(1250).ok).toBe(true);
    expect(toFils(0).ok).toBe(true);
    expect(toFils(1.5).ok).toBe(false);
    expect(toFils(-1).ok).toBe(false);
    expect(toFils(Number.NaN).ok).toBe(false);
  });
});

describe("categories", () => {
  it("creates a visible category with trimmed bilingual name", () => {
    const c = unwrap(createCategory(GRILL, { name: { en: " Grills ", ar: " مشاوي " }, sortOrder: 2 }, deps));
    expect(c).toMatchObject({ restaurantId: GRILL, name: { en: "Grills", ar: "مشاوي" }, sortOrder: 2, isHidden: false, deletedAt: null });
  });

  it("requires both names and limits their length", () => {
    expect(createCategory(GRILL, { name: { en: "Grills", ar: " " }, sortOrder: 0 }, deps)).toEqual({
      ok: false,
      error: { type: "NAME_REQUIRED", lang: "ar" },
    });
    const long = "x".repeat(MAX_NAME_LENGTH + 1);
    expect(createCategory(GRILL, { name: { en: long, ar: "مشاوي" }, sortOrder: 0 }, deps)).toEqual({
      ok: false,
      error: { type: "NAME_TOO_LONG", lang: "en" },
    });
  });

  it("rejects a negative or fractional sort order", () => {
    expect(createCategory(GRILL, { name: { en: "A", ar: "أ" }, sortOrder: -1 }, deps).ok).toBe(false);
    expect(createCategory(GRILL, { name: { en: "A", ar: "أ" }, sortOrder: 1.5 }, deps).ok).toBe(false);
  });

  it("can only be deleted when it has no live items", () => {
    expect(deleteCategory(grills(), 2, NOW)).toEqual({ ok: false, error: { type: "CATEGORY_NOT_EMPTY" } });
    expect(deleteCategory(grills(), 0, NOW).ok).toBe(true);
  });

  it("can be hidden, renamed and soft-deleted, but not edited after deletion", () => {
    const c = grills();
    expect(unwrap(setCategoryHidden(c, true)).isHidden).toBe(true);
    const deleted = unwrap(deleteCategory(c, 0, NOW));
    expect(deleted.deletedAt).toEqual(NOW);
    expect(updateCategory(deleted, { name: { en: "X", ar: "س" }, sortOrder: 0 })).toEqual({ ok: false, error: { type: "DELETED" } });
    expect(deleteCategory(deleted, 0, NOW)).toEqual({ ok: false, error: { type: "DELETED" } });
  });
});

describe("menu items", () => {
  it("creates an item in the category's restaurant, available by default", () => {
    const cat = grills();
    const item = kebab(cat);
    expect(item).toMatchObject({ restaurantId: GRILL, categoryId: cat.id, priceFils: 4500, isHidden: false, isSoldOut: false });
  });

  it("rejects prices that are not whole, non-negative fils", () => {
    for (const priceFils of [-1, 4.5, Number.POSITIVE_INFINITY]) {
      expect(createMenuItem(grills(), { ...kebabInput, priceFils }, deps)).toEqual({ ok: false, error: { type: "INVALID_PRICE" } });
    }
  });

  it("cannot be created in a deleted category", () => {
    const deleted = unwrap(deleteCategory(grills(), 0, NOW));
    expect(createMenuItem(deleted, kebabInput, deps)).toEqual({ ok: false, error: { type: "CATEGORY_NOT_FOUND" } });
  });

  it("can move to another category of the same restaurant only", () => {
    const item = kebab();
    const drinks = unwrap(createCategory(GRILL, { name: { en: "Drinks", ar: "مشروبات" }, sortOrder: 1 }, deps));
    expect(unwrap(updateMenuItem(item, { ...kebabInput, priceFils: 5000 }, drinks))).toMatchObject({
      categoryId: drinks.id,
      priceFils: 5000,
    });
    const otherRestaurant = unwrap(createCategory(COFFEE, { name: { en: "Hot", ar: "ساخن" }, sortOrder: 0 }, deps));
    expect(updateMenuItem(item, kebabInput, otherRestaurant)).toEqual({ ok: false, error: { type: "CATEGORY_NOT_FOUND" } });
  });

  it("cannot be changed after deletion", () => {
    const deleted = unwrap(deleteMenuItem(kebab(), NOW));
    expect(setItemSoldOut(deleted, true)).toEqual({ ok: false, error: { type: "DELETED" } });
    expect(setItemHidden(deleted, true)).toEqual({ ok: false, error: { type: "DELETED" } });
  });
});

describe("customer visibility", () => {
  it("shows sold-out items but does not let customers order them", () => {
    const cat = grills();
    const soldOut = unwrap(setItemSoldOut(kebab(cat), true));
    expect(isVisibleToCustomers(soldOut, cat)).toBe(true);
    expect(isOrderable(soldOut, cat)).toBe(false);
  });

  it("hides hidden or deleted items, and everything in a hidden category", () => {
    const cat = grills();
    const item = kebab(cat);
    expect(isOrderable(item, cat)).toBe(true);
    expect(isVisibleToCustomers(unwrap(setItemHidden(item, true)), cat)).toBe(false);
    expect(isVisibleToCustomers(unwrap(deleteMenuItem(item, NOW)), cat)).toBe(false);
    expect(isVisibleToCustomers(item, unwrap(setCategoryHidden(cat, true)))).toBe(false);
  });
});
