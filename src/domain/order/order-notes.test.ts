import { describe, expect, it } from "vitest";
import { addToCart, EMPTY_CART, lineKey, parseCart, priceCart, setNote, type CartCatalogEntry } from "@/domain/cart/cart";
import { createCategory, createMenuItem, updateMenuItem, type MenuItem, type MenuItemId } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createOrder, MAX_NOTE_LENGTH, normalizeNote, noteLength, type TableSessionId } from "./order";

// Item notes (PROJECT_SPEC.md §3.3, Nour 2026-11-27): the owner allows a short note per item; the customer writes it
// on the cart line; it is saved with the order line as typed and never changes the price.

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const NOW = new Date("2026-11-28T09:00:00Z");
let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const category = unwrap(createCategory(R, { name: { en: "Coffee", ar: "قهوة" }, sortOrder: 0 }, ids));
const item = (allowsNote: boolean): MenuItem =>
  unwrap(createMenuItem(category, { name: { en: "Latte", ar: "لاتيه" }, description: { en: "", ar: "" }, priceFils: 2250, sortOrder: 0, allowsNote }, ids));
const order = (it: MenuItem, note: unknown) =>
  createOrder(
    { restaurantId: R, sessionId: "s-1" as TableSessionId, number: 1, rates: { taxRateBp: 1600, serviceChargeBp: 0 }, lines: [{ item: it, category, groups: [], selectedOptionIds: [], quantity: 2, note }] },
    ids,
    NOW,
  );

describe("normalizeNote", () => {
  it("trims, turns line breaks and tabs into single spaces, and treats empty text or non-text as no note", () => {
    expect(normalizeNote("  less   sugar\n\tplease ")).toBe("less sugar please");
    expect(normalizeNote("سكر خفيف")).toBe("سكر خفيف");
    for (const none of ["", "   \n ", null, undefined, 5, {}]) expect(normalizeNote(none)).toBeNull();
  });

  it("counts characters as the customer sees them (an emoji or an Arabic letter is one)", () => {
    expect(noteLength("☕☕")).toBe(2);
    expect(noteLength("بدون سكر")).toBe(8);
  });
});

describe("the menu item's switch", () => {
  it("is off for a new item unless set, and an edit that does not mention it keeps it", () => {
    expect(unwrap(createMenuItem(category, { name: { en: "A", ar: "أ" }, description: { en: "", ar: "" }, priceFils: 1000, sortOrder: 0 }, ids)).allowsNote).toBe(false);
    const on = item(true);
    expect(unwrap(updateMenuItem(on, { name: on.name, description: on.description, priceFils: 2500, sortOrder: 0 }, category)).allowsNote).toBe(true);
    expect(unwrap(updateMenuItem(on, { name: on.name, description: on.description, priceFils: 2500, sortOrder: 0, allowsNote: false }, category)).allowsNote).toBe(false);
  });
});

describe("a note on an order line", () => {
  it("is saved cleaned, as typed, and does not change the price", () => {
    const withNote = unwrap(order(item(true), "  less sugar "));
    const without = unwrap(order(item(true), null));
    expect(withNote.items[0]?.note).toBe("less sugar");
    expect(without.items[0]?.note).toBeNull();
    expect(withNote.totalFils).toBe(without.totalFils);
  });

  it("is refused on an item that does not take notes, and when it is too long (refused, never cut)", () => {
    const off = item(false);
    expect(order(off, "less sugar")).toEqual({ ok: false, error: { type: "NOTE_NOT_ALLOWED", menuItemId: off.id } });
    expect(unwrap(order(off, "   ")).items[0]?.note).toBeNull(); // an empty note is no note
    const on = item(true);
    expect(unwrap(order(on, "x".repeat(MAX_NOTE_LENGTH))).items[0]?.note).toHaveLength(MAX_NOTE_LENGTH);
    expect(order(on, "x".repeat(MAX_NOTE_LENGTH + 1))).toEqual({ ok: false, error: { type: "NOTE_TOO_LONG", menuItemId: on.id, max: MAX_NOTE_LENGTH } });
  });
});

describe("notes in the cart", () => {
  const latte = "latte" as MenuItemId;

  it("the same item with different notes is two lines; the same note merges", () => {
    let cart = unwrap(addToCart(EMPTY_CART, { menuItemId: latte, optionIds: [], quantity: 1, note: "less sugar" }));
    cart = unwrap(addToCart(cart, { menuItemId: latte, optionIds: [], quantity: 1, note: "extra hot" }));
    cart = unwrap(addToCart(cart, { menuItemId: latte, optionIds: [], quantity: 2, note: " less  sugar" }));
    expect(cart.lines.map((l) => [l.note, l.quantity])).toEqual([
      ["less sugar", 3],
      ["extra hot", 1],
    ]);
  });

  it("setNote writes and clears a note in place, merges with an identical line, and refuses a note that is too long", () => {
    let cart = unwrap(addToCart(EMPTY_CART, { menuItemId: latte, optionIds: [], quantity: 1 }));
    cart = unwrap(addToCart(cart, { menuItemId: latte, optionIds: [], quantity: 2, note: "extra hot" }));
    const plain = lineKey(latte, []);
    expect(setNote(cart, plain, "x".repeat(MAX_NOTE_LENGTH + 1))).toEqual({ ok: false, error: { type: "NOTE_TOO_LONG", max: MAX_NOTE_LENGTH } });
    const merged = unwrap(setNote(cart, plain, "extra hot"));
    expect(merged.lines).toEqual([{ key: lineKey(latte, [], "extra hot"), menuItemId: latte, optionIds: [], quantity: 3, note: "extra hot" }]);
    const cleared = unwrap(setNote(merged, merged.lines[0]!.key, "  "));
    expect(cleared.lines.map((l) => [l.key, l.note])).toEqual([[plain, null]]);
    expect(setNote(cart, "nope", "x")).toEqual({ ok: false, error: { type: "LINE_NOT_FOUND" } });
  });

  it("a saved cart keeps its notes", () => {
    const cart = unwrap(addToCart(EMPTY_CART, { menuItemId: latte, optionIds: [], quantity: 1, note: "no foam" }));
    expect(parseCart(JSON.parse(JSON.stringify(cart)))).toEqual(cart);
  });

  it("the preview flags a note on an item that no longer takes notes, so it can be cleared before ordering", () => {
    const on = item(true);
    const off = { ...on, allowsNote: false };
    const cart = unwrap(addToCart(EMPTY_CART, { menuItemId: on.id, optionIds: [], quantity: 1, note: "no foam" }));
    const catalog = (it: MenuItem) => new Map<string, CartCatalogEntry>([[it.id, { item: it, category, groups: [] }]]);
    const rates = { taxRateBp: 1600, serviceChargeBp: 0 };
    expect(priceCart(cart, catalog(on), rates)).toMatchObject({ canCheckout: true, lines: [{ note: "no foam", problem: null, lineTotalFils: 2250 }] });
    expect(priceCart(cart, catalog(off), rates)).toMatchObject({ canCheckout: false, lines: [{ problem: "NOTE_NOT_ALLOWED" }] });
  });
});
