import { describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Fils } from "@/domain/shared/money";
import {
  createOption,
  createOptionGroup,
  deleteOption,
  deleteOptionGroup,
  isGroupOrderable,
  MAX_SELECT_LIMIT,
  priceWithOptions,
  updateOptionGroup,
  validateSelection,
  type MenuOption,
  type OptionGroup,
} from "./options";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
let n = 0;
const deps = { newId: () => `id-${++n}` };
const NOW = new Date("2026-10-06T12:00:00Z");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}
const group = (minSelect: number, maxSelect: number): OptionGroup =>
  unwrap(createOptionGroup(R, { name: { en: "Size", ar: "الحجم" }, minSelect, maxSelect, sortOrder: 0 }, deps));
const option = (g: OptionGroup, en: string, priceDeltaFils: number): MenuOption =>
  unwrap(createOption(g, { name: { en, ar: en }, priceDeltaFils, sortOrder: 0 }, deps));

describe("option groups", () => {
  it("accepts sensible selection rules", () => {
    expect(group(1, 1)).toMatchObject({ minSelect: 1, maxSelect: 1, restaurantId: R }); // pick exactly one
    expect(group(0, 3)).toMatchObject({ minSelect: 0, maxSelect: 3 }); // optional, up to 3
  });

  it("rejects impossible rules", () => {
    const bad = [
      [2, 1],
      [-1, 1],
      [0, 0],
      [0, MAX_SELECT_LIMIT + 1],
      [0.5, 1],
    ];
    for (const [minSelect, maxSelect] of bad) {
      expect(
        createOptionGroup(R, { name: { en: "X", ar: "س" }, minSelect: minSelect!, maxSelect: maxSelect!, sortOrder: 0 }, deps),
      ).toEqual({ ok: false, error: { type: "INVALID_SELECTION_RULE" } });
    }
  });

  it("requires both names, and can't be edited after deletion", () => {
    expect(createOptionGroup(R, { name: { en: "Size", ar: "" }, minSelect: 0, maxSelect: 1, sortOrder: 0 }, deps)).toEqual({
      ok: false,
      error: { type: "NAME_REQUIRED", lang: "ar" },
    });
    const deleted = unwrap(deleteOptionGroup(group(0, 1), NOW));
    expect(updateOptionGroup(deleted, { name: { en: "A", ar: "أ" }, minSelect: 0, maxSelect: 1, sortOrder: 0 })).toEqual({
      ok: false,
      error: { type: "DELETED" },
    });
  });
});

describe("options", () => {
  it("belong to the group's restaurant, with a whole-fils extra price (0 allowed)", () => {
    const g = group(1, 1);
    expect(option(g, "Large", 1000)).toMatchObject({ restaurantId: R, groupId: g.id, priceDeltaFils: 1000 });
    expect(option(g, "No onion", 0).priceDeltaFils).toBe(0);
    expect(createOption(g, { name: { en: "Bad", ar: "س" }, priceDeltaFils: 0.5, sortOrder: 0 }, deps)).toEqual({
      ok: false,
      error: { type: "INVALID_PRICE" },
    });
  });

  it("cannot be added to a deleted group", () => {
    const g = unwrap(deleteOptionGroup(group(0, 1), NOW));
    expect(createOption(g, { name: { en: "A", ar: "أ" }, priceDeltaFils: 0, sortOrder: 0 }, deps)).toEqual({
      ok: false,
      error: { type: "GROUP_NOT_FOUND" },
    });
  });
});

describe("ordering with options", () => {
  const size = group(1, 1);
  const small = option(size, "Small", 0);
  const large = option(size, "Large", 1000);
  const extras = group(0, 2);
  const cheese = option(extras, "Cheese", 250);
  const egg = option(extras, "Egg", 300);
  const sauce = option(extras, "Sauce", 0);

  it("requires exactly one size", () => {
    expect(validateSelection(size, [small, large], [])).toEqual({ ok: false, error: { type: "TOO_FEW_OPTIONS", min: 1 } });
    expect(validateSelection(size, [small, large], [small.id, large.id])).toEqual({
      ok: false,
      error: { type: "TOO_MANY_OPTIONS", max: 1 },
    });
    expect(unwrap(validateSelection(size, [small, large], [large.id]))).toEqual([large]);
  });

  it("allows no extras or up to the max, counting duplicates once", () => {
    expect(unwrap(validateSelection(extras, [cheese, egg, sauce], []))).toEqual([]);
    expect(unwrap(validateSelection(extras, [cheese, egg, sauce], [cheese.id, cheese.id, egg.id]))).toHaveLength(2);
    expect(validateSelection(extras, [cheese, egg, sauce], [cheese.id, egg.id, sauce.id]).ok).toBe(false);
  });

  it("rejects options from another group or deleted options", () => {
    expect(validateSelection(size, [small, large, cheese], [cheese.id])).toEqual({
      ok: false,
      error: { type: "UNKNOWN_OPTION", optionId: cheese.id },
    });
    const gone = unwrap(deleteOption(large, NOW));
    expect(validateSelection(size, [small, gone], [gone.id]).ok).toBe(false);
  });

  it("adds option prices to the item price in whole fils", () => {
    expect(priceWithOptions(4500 as Fils, [large, cheese, egg])).toBe(6050);
    expect(priceWithOptions(4500 as Fils, [])).toBe(4500);
  });

  it("flags a required group without enough options as not orderable", () => {
    const empty = group(1, 1);
    expect(isGroupOrderable(empty, [])).toBe(false);
    expect(isGroupOrderable(size, [small, large])).toBe(true);
  });
});
