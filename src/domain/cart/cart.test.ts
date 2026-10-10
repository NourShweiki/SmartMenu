import { describe, expect, it } from "vitest";
import { createCategory, createMenuItem, deleteMenuItem, setItemSoldOut, type MenuCategory, type MenuItem, type MenuItemId } from "@/domain/menu/menu";
import { createOption, createOptionGroup, deleteOption, type MenuOption, type OptionGroup, type OptionId } from "@/domain/menu/options";
import { createOrder, MAX_LINE_QUANTITY, MAX_ORDER_LINES, type OrderLineRequest, type TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import {
  addToCart,
  cartItemCount,
  EMPTY_CART,
  lineKey,
  parseCart,
  priceCart,
  removeLine,
  setQuantity,
  type Cart,
  type CartCatalogEntry,
} from "./cart";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const NOW = new Date("2026-10-10T12:00:00Z");
const RATES = { taxRateBp: 1600, serviceChargeBp: 1000 };
let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

// A tiny menu: Kebab (required Size, optional Extras), Hummus (no options).
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
const full = catalog(
  entryOf(kebab, [{ group: size, options: [small, large] }, { group: extras, options: [cheese, bacon] }]),
  entryOf(hummus),
);
const add = (cart: Cart, item: MenuItem, optionIds: OptionId[] = [], quantity = 1) =>
  unwrap(addToCart(cart, { menuItemId: item.id, optionIds, quantity }));

describe("addToCart", () => {
  it("adds a line and merges the same item with the same options, whatever order they were ticked in", () => {
    let cart = add(EMPTY_CART, kebab, [large.id, cheese.id]);
    cart = add(cart, kebab, [cheese.id, large.id], 2); // same set, other order
    cart = add(cart, kebab, [small.id]); // different options = another line
    cart = add(cart, hummus);
    expect(cart.lines.map((l) => [l.menuItemId === kebab.id ? "kebab" : "hummus", l.optionIds.length, l.quantity])).toEqual([
      ["kebab", 2, 3],
      ["kebab", 1, 1],
      ["hummus", 0, 1],
    ]);
    expect(cartItemCount(cart)).toBe(5);
    expect(lineKey("a", ["z", "b", "b"])).toBe(lineKey("a", ["b", "z"]));
  });

  it("refuses bad quantities, too many of one line, and a full cart", () => {
    for (const quantity of [0, -1, 1.5, Number.NaN]) {
      expect(addToCart(EMPTY_CART, { menuItemId: hummus.id, optionIds: [], quantity })).toEqual({ ok: false, error: { type: "INVALID_QUANTITY" } });
    }
    expect(addToCart(EMPTY_CART, { menuItemId: hummus.id, optionIds: [], quantity: MAX_LINE_QUANTITY + 1 })).toEqual({
      ok: false,
      error: { type: "QUANTITY_TOO_HIGH", max: MAX_LINE_QUANTITY },
    });
    const nearly = add(EMPTY_CART, hummus, [], MAX_LINE_QUANTITY);
    expect(addToCart(nearly, { menuItemId: hummus.id, optionIds: [], quantity: 1 })).toMatchObject({ ok: false, error: { type: "QUANTITY_TOO_HIGH" } });

    let cart: Cart = EMPTY_CART;
    for (let i = 0; i < MAX_ORDER_LINES; i++) cart = unwrap(addToCart(cart, { menuItemId: `item-${i}` as MenuItemId, optionIds: [], quantity: 1 }));
    expect(addToCart(cart, { menuItemId: "one-more" as MenuItemId, optionIds: [], quantity: 1 })).toEqual({
      ok: false,
      error: { type: "CART_FULL", max: MAX_ORDER_LINES },
    });
    // Adding more of an item already in a full cart is still fine.
    expect(addToCart(cart, { menuItemId: "item-0" as MenuItemId, optionIds: [], quantity: 1 }).ok).toBe(true);
  });

  it("does not change the cart it was given", () => {
    const cart = add(EMPTY_CART, hummus);
    add(cart, hummus);
    expect(cart.lines[0]!.quantity).toBe(1);
  });
});

describe("setQuantity / removeLine", () => {
  it("changes a quantity, removes the line at 0, and refuses unknown lines and bad numbers", () => {
    const cart = add(add(EMPTY_CART, hummus), kebab, [small.id]);
    const key = cart.lines[0]!.key;
    expect(unwrap(setQuantity(cart, key, 4)).lines[0]!.quantity).toBe(4);
    expect(unwrap(setQuantity(cart, key, 0)).lines).toHaveLength(1);
    expect(setQuantity(cart, "nope", 2)).toEqual({ ok: false, error: { type: "LINE_NOT_FOUND" } });
    expect(setQuantity(cart, key, 1.5)).toEqual({ ok: false, error: { type: "INVALID_QUANTITY" } });
    expect(setQuantity(cart, key, MAX_LINE_QUANTITY + 1)).toMatchObject({ ok: false, error: { type: "QUANTITY_TOO_HIGH" } });
    expect(removeLine(cart, key).lines.map((l) => l.menuItemId)).toEqual([kebab.id]);
  });
});

describe("parseCart (what the browser stored)", () => {
  it("round-trips a cart through JSON", () => {
    const cart = add(add(EMPTY_CART, kebab, [large.id, cheese.id], 2), hummus);
    expect(parseCart(JSON.parse(JSON.stringify(cart)))).toEqual(cart);
  });

  it("never throws: odd storage becomes an empty cart, odd lines are dropped one by one", () => {
    for (const odd of [null, undefined, "x", 5, [], {}, { lines: "no" }, { lines: [null, 1, "a", {}] }]) {
      expect(parseCart(odd)).toEqual(EMPTY_CART);
    }
    const mixed = parseCart({
      lines: [
        { menuItemId: "good", optionIds: ["b", "a"], quantity: 2 },
        { menuItemId: "", optionIds: [], quantity: 1 },
        { menuItemId: "bad-qty", optionIds: [], quantity: -3 },
        { menuItemId: "bad-opts", optionIds: "x", quantity: 1 },
        { menuItemId: "huge", optionIds: [], quantity: 5000 },
        { menuItemId: "weird-opts", optionIds: [1, "", "ok"], quantity: 1 },
      ],
    });
    expect(mixed.lines.map((l) => [l.menuItemId, [...l.optionIds], l.quantity])).toEqual([
      ["good", ["a", "b"], 2],
      ["weird-opts", ["ok"], 1],
    ]);
  });
});

describe("priceCart", () => {
  it("prices lines from the live menu and totals them like an order (service on subtotal, tax on subtotal + service)", () => {
    let cart = add(EMPTY_CART, kebab, [large.id, cheese.id], 2); // (4.500 + 0.500 + 0.300) x 2 = 10.600
    cart = add(cart, hummus); // 1.250
    const priced = priceCart(cart, full, RATES);
    expect(priced.lines.map((l) => [l.item?.name.en, l.unitPriceFils, l.lineTotalFils, l.problem])).toEqual([
      ["Kebab", 5300, 10600, null],
      ["Hummus", 1250, 1250, null],
    ]);
    expect(priced.lines[0]!.options.map((o) => o.name.en)).toEqual(["Large", "Cheese"]);
    expect(priced.subtotalFils).toBe(11850);
    expect(priced.serviceChargeFils).toBe(1185);
    expect(priced.taxFils).toBe(2086); // 16% of 13.035 = 2.0856, rounded half up to whole fils
    expect(priced.canCheckout).toBe(true);
  });

  it("gives exactly the totals the real order will compute (the preview never disagrees with the order)", () => {
    const cart = add(add(add(EMPTY_CART, kebab, [large.id, bacon.id, cheese.id], 3), kebab, [small.id]), hummus, [], 2);
    const priced = priceCart(cart, full, RATES);
    const lines: OrderLineRequest[] = cart.lines.map((l) => ({
      ...full.get(l.menuItemId)!,
      selectedOptionIds: l.optionIds,
      quantity: l.quantity,
    }));
    const order = unwrap(createOrder({ restaurantId: R, sessionId: "s" as TableSessionId, number: 1, lines, rates: RATES }, ids, NOW));
    expect(priced).toMatchObject({
      subtotalFils: order.subtotalFils,
      serviceChargeFils: order.serviceChargeFils,
      taxFils: order.taxFils,
      totalFils: order.totalFils,
    });
    expect(priced.lines.map((l) => l.lineTotalFils)).toEqual(order.items.map((i) => i.lineTotalFils));
  });

  it("works with no service charge and no tax, and with an empty cart", () => {
    const priced = priceCart(add(EMPTY_CART, hummus), full, { taxRateBp: 0, serviceChargeBp: 0 });
    expect(priced).toMatchObject({ subtotalFils: 1250, serviceChargeFils: 0, taxFils: 0, totalFils: 1250 });
    expect(priceCart(EMPTY_CART, full, RATES)).toMatchObject({ lines: [], totalFils: 0, canCheckout: false });
  });

  it("keeps a line that can no longer be ordered, adds nothing for it, and blocks checkout", () => {
    const cart = add(add(EMPTY_CART, hummus), kebab, [large.id]);
    const soldOutKebab = { ...entryOf(kebab, [{ group: size, options: [small, large] }]), item: unwrap(setItemSoldOut(kebab, true)) };
    const soldOut = priceCart(cart, catalog(entryOf(hummus), soldOutKebab), RATES);
    expect(soldOut.lines.map((l) => l.problem)).toEqual([null, "ITEM_UNAVAILABLE"]);
    expect(soldOut.subtotalFils).toBe(1250);
    expect(soldOut.canCheckout).toBe(false);

    const gone = priceCart(cart, catalog(entryOf(hummus)), RATES);
    expect(gone.lines[1]).toMatchObject({ problem: "ITEM_UNAVAILABLE", item: null });

    const deleted = priceCart(cart, catalog(entryOf(hummus), entryOf({ ...kebab, deletedAt: NOW } as MenuItem)), RATES);
    expect(deleted.lines[1]!.problem).toBe("ITEM_UNAVAILABLE");
    expect(unwrap(deleteMenuItem(kebab, NOW)).deletedAt).toEqual(NOW);
  });

  it("treats an item as unavailable when a required option group has nothing left to choose (like the order does)", () => {
    const cart = add(EMPTY_CART, kebab, []);
    const noSizes = catalog(entryOf(kebab, [{ group: size, options: [unwrap(deleteOption(small, NOW)), unwrap(deleteOption(large, NOW))] }]));
    expect(priceCart(cart, noSizes, RATES).lines[0]!.problem).toBe("ITEM_UNAVAILABLE");
    // The real order refuses it the same way.
    const lines: OrderLineRequest[] = [{ ...noSizes.get(kebab.id)!, selectedOptionIds: [], quantity: 1 }];
    expect(createOrder({ restaurantId: R, sessionId: "s" as TableSessionId, number: 1, lines, rates: RATES }, ids, NOW)).toMatchObject({ ok: false, error: { type: "ITEM_NOT_ORDERABLE" } });
  });

  it("flags a removed option and choices that break the option rules", () => {
    const withLarge = add(EMPTY_CART, kebab, [large.id]);
    const withoutLarge = catalog(entryOf(kebab, [{ group: size, options: [small, unwrap(deleteOption(large, NOW))] }, { group: extras, options: [cheese] }]));
    // A deleted option is listed but not offered any more.
    expect(priceCart(withLarge, withoutLarge, RATES).lines[0]!.problem).toBe("OPTION_UNAVAILABLE");

    const noPick = add(EMPTY_CART, kebab, []); // Size is required (min 1)
    expect(priceCart(noPick, full, RATES).lines[0]!.problem).toBe("SELECTION_INVALID");
    const twoSizes = add(EMPTY_CART, kebab, [small.id, large.id]); // max 1
    expect(priceCart(twoSizes, full, RATES).lines[0]!.problem).toBe("SELECTION_INVALID");
    const tooManyExtras = add(EMPTY_CART, kebab, [large.id, cheese.id, bacon.id, opt(extras, "Egg", 100).id]);
    expect(priceCart(tooManyExtras, catalog(entryOf(kebab, [{ group: size, options: [small, large] }, { group: extras, options: [cheese, bacon] }])), RATES).lines[0]!.problem).toBe(
      "OPTION_UNAVAILABLE",
    );
  });
});
