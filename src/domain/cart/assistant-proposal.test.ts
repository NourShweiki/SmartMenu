import { describe, expect, it } from "vitest";
import { createCategory, createMenuItem, setItemSoldOut, type MenuCategory, type MenuItem, type MenuItemId } from "@/domain/menu/menu";
import { createOption, createOptionGroup, deleteOption, type MenuOption, type OptionGroup } from "@/domain/menu/options";
import { MAX_LINE_QUANTITY, MAX_ORDER_LINES } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { groundProposal, type ProposedLine } from "./assistant-proposal";
import { addToCart, EMPTY_CART, type CartCatalogEntry } from "./cart";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const NOW = new Date("2026-10-10T12:00:00Z");
const RATES = { taxRateBp: 1600, serviceChargeBp: 1000 };
let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

// Kebab (required Size, optional Extras up to 2), Hummus (no options).
const category: MenuCategory = unwrap(createCategory(R, { name: { en: "Grill", ar: "مشاوي" }, sortOrder: 0 }, ids));
const mk = (en: string, priceFils: number): MenuItem =>
  unwrap(createMenuItem(category, { name: { en, ar: en }, description: { en: "", ar: "" }, priceFils, sortOrder: 0 }, ids));
const kebab = mk("Kebab", 4500);
const hummus = mk("Hummus", 1250);
const size: OptionGroup = unwrap(createOptionGroup(R, { name: { en: "Size", ar: "الحجم" }, minSelect: 1, maxSelect: 1, sortOrder: 0 }, ids));
const extras: OptionGroup = unwrap(createOptionGroup(R, { name: { en: "Extras", ar: "إضافات" }, minSelect: 0, maxSelect: 2, sortOrder: 1 }, ids));
const opt = (g: OptionGroup, en: string, d: number): MenuOption => unwrap(createOption(g, { name: { en, ar: en }, priceDeltaFils: d, sortOrder: 0 }, ids));
const small = opt(size, "Small", 0);
const large = opt(size, "Large", 500);
const cheese = opt(extras, "Cheese", 300);
const bacon = opt(extras, "Bacon", 400);

const entryOf = (item: MenuItem, groups: CartCatalogEntry["groups"] = []): CartCatalogEntry => ({ item, category, groups });
const catalog = (...entries: CartCatalogEntry[]) => new Map(entries.map((e) => [e.item.id as string, e]));
const kebabEntry = entryOf(kebab, [{ group: size, options: [small, large] }, { group: extras, options: [cheese, bacon] }]);
const full = catalog(kebabEntry, entryOf(hummus));
const line = (item: MenuItem, optionIds: string[] = [], quantity = 1): ProposedLine => ({ menuItemId: item.id, optionIds, quantity });

describe("groundProposal", () => {
  it("accepts lines that can be ordered right now and builds the cart from them", () => {
    const result = groundProposal([line(kebab, [large.id, cheese.id], 2), line(hummus)], full, RATES);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(2);
    expect(result.cart.lines.map((l) => l.quantity)).toEqual([2, 1]);
  });

  it("rejects an item that is not on the menu: an invented id, or one that is not a string", () => {
    const invented = line({ id: "made-up-pizza" as MenuItemId } as MenuItem);
    const garbage = { menuItemId: 42, optionIds: [], quantity: 1 } as unknown as ProposedLine;
    const result = groundProposal([invented, garbage, line(hummus)], full, RATES);
    expect(result.rejected.map((r) => r.reason)).toEqual(["UNKNOWN_ITEM", "UNKNOWN_ITEM"]);
    expect(result.accepted).toEqual([line(hummus)]); // one bad line never blocks the rest
  });

  it("rejects options that are not an array of ids", () => {
    const bad = { menuItemId: hummus.id, optionIds: "cheese", quantity: 1 } as unknown as ProposedLine;
    expect(groundProposal([bad], full, RATES).rejected[0]?.reason).toBe("UNKNOWN_ITEM");
  });

  it("rejects a sold-out item", () => {
    const soldOut = catalog({ ...kebabEntry, item: unwrap(setItemSoldOut(kebab, true)) });
    expect(groundProposal([line(kebab, [small.id])], soldOut, RATES).rejected[0]?.reason).toBe("ITEM_UNAVAILABLE");
  });

  it("rejects an option that does not exist (or belongs to another item)", () => {
    expect(groundProposal([line(kebab, [small.id, "invented-option"])], full, RATES).rejected[0]?.reason).toBe("OPTION_UNAVAILABLE");
    const withoutLarge = catalog(entryOf(kebab, [{ group: size, options: [small, unwrap(deleteOption(large, NOW))] }, { group: extras, options: [cheese] }]));
    expect(groundProposal([line(kebab, [large.id])], withoutLarge, RATES).rejected[0]?.reason).toBe("OPTION_UNAVAILABLE");
  });

  it("rejects choices that break the item's option rules: a required group left out, or too many picks", () => {
    expect(groundProposal([line(kebab)], full, RATES).rejected[0]?.reason).toBe("SELECTION_INVALID"); // Size is required
    expect(groundProposal([line(kebab, [small.id, large.id])], full, RATES).rejected[0]?.reason).toBe("SELECTION_INVALID"); // max 1 size
  });

  it("rejects bad quantities", () => {
    for (const quantity of [0, -2, 1.5, Number.NaN]) {
      expect(groundProposal([line(hummus, [], quantity)], full, RATES).rejected[0]?.reason).toBe("INVALID_QUANTITY");
    }
    expect(groundProposal([line(hummus, [], MAX_LINE_QUANTITY + 1)], full, RATES).rejected[0]?.reason).toBe("QUANTITY_TOO_HIGH");
  });

  it("adds to the customer's existing cart and merges the same item, but never beyond the limits", () => {
    const existing = unwrap(addToCart(EMPTY_CART, { menuItemId: hummus.id, optionIds: [], quantity: MAX_LINE_QUANTITY }));
    const result = groundProposal([line(hummus), line(kebab, [small.id])], full, RATES, existing);
    expect(result.rejected.map((r) => r.reason)).toEqual(["QUANTITY_TOO_HIGH"]);
    expect(result.cart.lines.map((l) => [l.menuItemId, l.quantity])).toEqual([
      [hummus.id, MAX_LINE_QUANTITY],
      [kebab.id, 1],
    ]);

    let crowded = EMPTY_CART;
    for (let i = 0; i < MAX_ORDER_LINES; i++) crowded = unwrap(addToCart(crowded, { menuItemId: `x-${i}` as MenuItemId, optionIds: [], quantity: 1 }));
    expect(groundProposal([line(hummus)], full, RATES, crowded).rejected[0]?.reason).toBe("CART_FULL");
  });

  it("returns the customer's cart untouched when nothing is accepted", () => {
    const existing = unwrap(addToCart(EMPTY_CART, { menuItemId: hummus.id, optionIds: [], quantity: 2 }));
    expect(groundProposal([], full, RATES, existing).cart).toBe(existing);
  });
});
