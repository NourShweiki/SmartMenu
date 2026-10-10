import { describe, expect, it } from "vitest";
import {
  createCategory,
  createMenuItem,
  setItemHidden,
  setItemSoldOut,
  type MenuCategory,
  type MenuItem,
} from "@/domain/menu/menu";
import {
  createOption,
  createOptionGroup,
  deleteOption,
  type MenuOption,
  type OptionGroup,
} from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { can, type Role } from "@/domain/restaurant/role";
import {
  calculateTotals,
  createOrder,
  moveOrderTo,
  nextStatus,
  permissionToMoveTo,
  shouldNotifyCustomer,
  ORDER_FLOW,
  MAX_LINE_QUANTITY,
  MAX_ORDER_LINES,
  type Order,
  type OrderLineRequest,
  type OrderStatus,
  type TableSessionId,
} from "./order";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const OTHER = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const SESSION = "33333333-3333-4000-8000-000000000003" as TableSessionId;
const NOW = new Date("2026-10-10T12:00:00Z");
const LATER = new Date("2026-10-10T12:05:00Z");
const RATES = { taxRateBp: 1600, serviceChargeBp: 1000 };

let n = 0;
const deps = { newId: () => `id-${++n}` };

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

const category = (restaurantId = R): MenuCategory =>
  unwrap(createCategory(restaurantId, { name: { en: "Grill", ar: "مشاوي" }, sortOrder: 0 }, deps));
const item = (cat: MenuCategory, priceFils: number, en = "Kebab"): MenuItem =>
  unwrap(
    createMenuItem(cat, { name: { en, ar: "كباب" }, description: { en: "", ar: "" }, priceFils, sortOrder: 0 }, deps),
  );
const group = (min: number, max: number, en = "Size"): OptionGroup =>
  unwrap(createOptionGroup(R, { name: { en, ar: "الحجم" }, minSelect: min, maxSelect: max, sortOrder: 0 }, deps));
const option = (g: OptionGroup, en: string, priceDeltaFils: number): MenuOption =>
  unwrap(createOption(g, { name: { en, ar: en }, priceDeltaFils, sortOrder: 0 }, deps));

function line(overrides: Partial<OrderLineRequest> & { priceFils?: number } = {}): OrderLineRequest {
  const cat = overrides.category ?? category();
  return {
    item: overrides.item ?? item(cat, overrides.priceFils ?? 2500),
    category: cat,
    groups: [],
    selectedOptionIds: [],
    quantity: 1,
    ...overrides,
  };
}
const place = (lines: OrderLineRequest[], number = 1) =>
  createOrder({ restaurantId: R, sessionId: SESSION, number, lines, rates: RATES }, deps, NOW);

describe("calculateTotals", () => {
  it("adds service charge on the subtotal, then tax on subtotal + service", () => {
    // 10.000 JD: service 10% = 1.000, tax 16% of 11.000 = 1.760
    expect(calculateTotals(10_000, RATES)).toEqual({
      subtotalFils: 10_000,
      serviceChargeFils: 1_000,
      taxFils: 1_760,
      totalFils: 12_760,
    });
  });

  it("rounds half up to whole fils, once per charge", () => {
    // service 10% of 5 fils = 0.5 -> 1; tax 16% of 6 = 0.96 -> 1
    expect(calculateTotals(5, RATES)).toMatchObject({ serviceChargeFils: 1, taxFils: 1, totalFils: 7 });
    // 4 fils: service 0.4 -> 0; tax 16% of 4 = 0.64 -> 1
    expect(calculateTotals(4, RATES)).toMatchObject({ serviceChargeFils: 0, taxFils: 1, totalFils: 5 });
  });

  it("works with no charges at all", () => {
    expect(calculateTotals(3_250, { taxRateBp: 0, serviceChargeBp: 0 })).toMatchObject({
      serviceChargeFils: 0,
      taxFils: 0,
      totalFils: 3_250,
    });
  });

  it("stays exact for huge orders (no float drift)", () => {
    const big = 4_000_000_000_000;
    const t = calculateTotals(big, RATES);
    expect(t.serviceChargeFils).toBe(400_000_000_000);
    expect(t.taxFils).toBe(704_000_000_000);
    expect(t.totalFils).toBe(5_104_000_000_000);
  });
});

describe("createOrder", () => {
  it("builds a NEW order with snapshots and totals", () => {
    const cat = category();
    const kebab = item(cat, 2_500);
    const size = group(1, 1);
    const large = option(size, "Large", 500);
    const order = unwrap(
      place([{ item: kebab, category: cat, groups: [{ group: size, options: [large] }], selectedOptionIds: [large.id], quantity: 2 }], 7),
    );

    expect(order).toMatchObject({
      status: "NEW",
      number: 7,
      restaurantId: R,
      sessionId: SESSION,
      taxRateBp: 1600,
      serviceChargeBp: 1000,
      createdAt: NOW,
      statusChangedAt: NOW,
    });
    expect(order.items[0]).toMatchObject({
      menuItemId: kebab.id,
      name: kebab.name,
      unitPriceFils: 2_500,
      quantity: 2,
      lineTotalFils: 6_000, // (2.500 + 0.500) x 2
    });
    expect(order.items[0]!.options).toEqual([
      { optionId: large.id, groupName: size.name, name: large.name, priceDeltaFils: 500 },
    ]);
    expect(order.subtotalFils).toBe(6_000);
    expect(order.totalFils).toBe(order.subtotalFils + order.serviceChargeFils + order.taxFils);
  });

  it("sums several lines", () => {
    const cat = category();
    const order = unwrap(
      place([line({ category: cat, item: item(cat, 1_000) }), line({ category: cat, item: item(cat, 2_250), quantity: 3 })]),
    );
    expect(order.subtotalFils).toBe(7_750);
  });

  it("keeps the snapshot when the menu is edited after ordering", () => {
    const cat = category();
    const size = group(1, 1);
    const large = option(size, "Large", 500);
    const kebab = item(cat, 2_500);
    const order = unwrap(
      place([{ item: kebab, category: cat, groups: [{ group: size, options: [large] }], selectedOptionIds: [large.id], quantity: 1 }]),
    );
    const before = JSON.stringify(order);

    // Edit the very objects the order was built from (price, names, option price).
    (kebab as { priceFils: number }).priceFils = 9_999;
    (kebab.name as { en: string }).en = "Renamed";
    (large as { priceDeltaFils: number }).priceDeltaFils = 8_000;
    (large.name as { en: string }).en = "Huge";
    (size.name as { en: string }).en = "Portion";

    expect(JSON.stringify(order)).toBe(before);
    expect(order.items[0]).toMatchObject({ unitPriceFils: 2_500, lineTotalFils: 3_000 });
    expect(order.items[0]!.name.en).toBe("Kebab");
    expect(order.items[0]!.options[0]).toMatchObject({ priceDeltaFils: 500 });
    expect(order.items[0]!.options[0]!.name.en).toBe("Large");
    expect(order.items[0]!.options[0]!.groupName.en).toBe("Size");
  });

  it("rejects invalid tax / service rates instead of throwing", () => {
    for (const bad of [12.5, -1, 10_001, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = createOrder({ restaurantId: R, sessionId: SESSION, number: 1, lines: [line()], rates: { taxRateBp: bad, serviceChargeBp: 0 } }, deps, NOW);
      expect(r).toEqual({ ok: false, error: { type: "INVALID_RATES" } });
      const r2 = createOrder({ restaurantId: R, sessionId: SESSION, number: 1, lines: [line()], rates: { taxRateBp: 0, serviceChargeBp: bad } }, deps, NOW);
      expect(r2).toEqual({ ok: false, error: { type: "INVALID_RATES" } });
    }
    const edge = createOrder({ restaurantId: R, sessionId: SESSION, number: 1, lines: [line()], rates: { taxRateBp: 10_000, serviceChargeBp: 0 } }, deps, NOW);
    expect(edge.ok).toBe(true);
  });

  it("refuses an order whose total passes the price cap", () => {
    const cat = category();
    const priciest = item(cat, 1_000_000_000); // the maximum single price
    expect(place([line({ category: cat, item: priciest, quantity: 1 })])).toEqual({ ok: false, error: { type: "ORDER_TOO_LARGE" } });
    expect(place([line({ category: cat, item: priciest, quantity: MAX_LINE_QUANTITY })])).toEqual({
      ok: false,
      error: { type: "ORDER_TOO_LARGE" },
    });
  });

  it("rejects empty orders, bad numbers and too many lines", () => {
    expect(place([])).toEqual({ ok: false, error: { type: "EMPTY_ORDER" } });
    expect(place([line()], 0)).toEqual({ ok: false, error: { type: "INVALID_NUMBER" } });
    const cat = category();
    const many = Array.from({ length: MAX_ORDER_LINES + 1 }, () => line({ category: cat }));
    expect(place(many)).toEqual({ ok: false, error: { type: "TOO_MANY_LINES", max: MAX_ORDER_LINES } });
  });

  it("rejects bad quantities", () => {
    for (const quantity of [0, -1, 1.5, MAX_LINE_QUANTITY + 1, Number.NaN]) {
      const r = place([line({ quantity })]);
      expect(r).toMatchObject({ ok: false, error: { type: "INVALID_QUANTITY" } });
    }
    expect(place([line({ quantity: MAX_LINE_QUANTITY })]).ok).toBe(true);
  });

  it("refuses hidden, sold-out and deleted items", () => {
    const cat = category();
    const base = item(cat, 1_000);
    const hidden = unwrap(setItemHidden(base, true));
    const soldOut = unwrap(setItemSoldOut(base, true));
    const deleted = { ...base, deletedAt: NOW };
    for (const bad of [hidden, soldOut, deleted]) {
      expect(place([line({ category: cat, item: bad })])).toMatchObject({
        ok: false,
        error: { type: "ITEM_NOT_ORDERABLE", menuItemId: base.id },
      });
    }
    const hiddenCat = { ...cat, isHidden: true };
    expect(place([line({ category: hiddenCat, item: base })])).toMatchObject({ ok: false, error: { type: "ITEM_NOT_ORDERABLE" } });
  });

  it("refuses a category that is not the item's own", () => {
    const cat = category();
    const stranger = category();
    expect(place([{ ...line({ category: cat }), category: stranger }])).toMatchObject({
      ok: false,
      error: { type: "ITEM_NOT_ORDERABLE" },
    });
  });

  it("refuses anything from another restaurant", () => {
    const foreignCat = category(OTHER);
    expect(place([line({ category: foreignCat })])).toEqual({ ok: false, error: { type: "WRONG_RESTAURANT" } });

    const cat = category();
    const foreignGroup = unwrap(
      createOptionGroup(OTHER, { name: { en: "X", ar: "س" }, minSelect: 0, maxSelect: 1, sortOrder: 0 }, deps),
    );
    expect(place([line({ category: cat, groups: [{ group: foreignGroup, options: [] }] })])).toEqual({
      ok: false,
      error: { type: "WRONG_RESTAURANT" },
    });
  });

  describe("options", () => {
    const cat = category();
    const kebab = item(cat, 2_000);
    const size = group(1, 1);
    const small = option(size, "Small", 0);
    const large = option(size, "Large", 750);
    const extras = group(0, 2, "Extras");
    const cheese = option(extras, "Cheese", 300);
    const bacon = option(extras, "Bacon", 400);
    const onion = option(extras, "Onion", 100);
    const groups = [
      { group: size, options: [small, large] },
      { group: extras, options: [cheese, bacon, onion] },
    ];
    const order = (selectedOptionIds: string[]) => place([{ item: kebab, category: cat, groups, selectedOptionIds, quantity: 1 }]);

    it("prices each pick and snapshots its group", () => {
      const o = unwrap(order([large.id, cheese.id, bacon.id]));
      expect(o.items[0]!.lineTotalFils).toBe(3_450); // 2.000 + 0.750 + 0.300 + 0.400
      expect(o.items[0]!.options.map((p) => p.name.en)).toEqual(["Large", "Cheese", "Bacon"]);
      expect(o.items[0]!.options[1]!.groupName).toEqual(extras.name);
    });

    it("requires picks for a required group", () => {
      expect(order([])).toMatchObject({
        ok: false,
        error: { type: "SELECTION", menuItemId: kebab.id, reason: { type: "TOO_FEW_OPTIONS", min: 1 } },
      });
    });

    it("rejects too many picks in a group", () => {
      expect(order([small.id, large.id])).toMatchObject({
        ok: false,
        error: { type: "SELECTION", reason: { type: "TOO_MANY_OPTIONS", max: 1 } },
      });
      expect(order([large.id, cheese.id, bacon.id, onion.id])).toMatchObject({
        ok: false,
        error: { type: "SELECTION", reason: { type: "TOO_MANY_OPTIONS", max: 2 } },
      });
    });

    it("rejects options not attached to the item, unknown ids and deleted options", () => {
      const strangerGroup = group(0, 1, "Sauce");
      const mayo = option(strangerGroup, "Mayo", 100);
      expect(order([large.id, mayo.id])).toMatchObject({
        ok: false,
        error: { type: "SELECTION", reason: { type: "UNKNOWN_OPTION", optionId: mayo.id } },
      });
      expect(order([large.id, "nope"])).toMatchObject({
        ok: false,
        error: { type: "SELECTION", reason: { type: "UNKNOWN_OPTION", optionId: "nope" } },
      });
      const goneCheese = unwrap(deleteOption(cheese, NOW));
      const withGone = [
        { group: size, options: [small, large] },
        { group: extras, options: [goneCheese, bacon, onion] },
      ];
      expect(
        place([{ item: kebab, category: cat, groups: withGone, selectedOptionIds: [large.id, goneCheese.id], quantity: 1 }]),
      ).toMatchObject({ ok: false, error: { type: "SELECTION", reason: { type: "UNKNOWN_OPTION" } } });
    });

    it("does not charge a group twice when it is listed twice", () => {
      const o = unwrap(
        place([{ item: kebab, category: cat, groups: [...groups, groups[0]!], selectedOptionIds: [large.id], quantity: 1 }]),
      );
      expect(o.items[0]!.options).toHaveLength(1);
      expect(o.items[0]!.lineTotalFils).toBe(2_750);
    });

    it("treats an item as not orderable when a required group has too few live options", () => {
      const empty = group(1, 1, "Bread");
      const gone = unwrap(deleteOption(option(empty, "White", 0), NOW));
      expect(
        place([{ item: kebab, category: cat, groups: [{ group: empty, options: [gone] }], selectedOptionIds: [], quantity: 1 }]),
      ).toEqual({ ok: false, error: { type: "ITEM_NOT_ORDERABLE", menuItemId: kebab.id } });
    });

    it("ignores a deleted group", () => {
      const removed = { ...group(1, 1, "Old"), deletedAt: NOW };
      const o = unwrap(
        place([{ item: kebab, category: cat, groups: [...groups, { group: removed, options: [] }], selectedOptionIds: [small.id], quantity: 1 }]),
      );
      expect(o.items[0]!.lineTotalFils).toBe(2_000);
    });

    it("counts a duplicated id once", () => {
      const o = unwrap(order([large.id, large.id]));
      expect(o.items[0]!.options).toHaveLength(1);
      expect(o.items[0]!.lineTotalFils).toBe(2_750);
    });
  });

  it("starts an added order at NEW even when an earlier order in the session is further along", () => {
    const cat = category();
    const first = unwrap(place([line({ category: cat })], 1));
    const confirmed = unwrap(moveOrderTo(first, "CONFIRMED", LATER));
    const added = unwrap(place([line({ category: cat })], 2));
    expect(confirmed.status).toBe("CONFIRMED");
    expect(added).toMatchObject({ status: "NEW", sessionId: confirmed.sessionId, number: 2 });
    expect(added.id).not.toBe(confirmed.id);
  });
});

describe("status flow", () => {
  const fresh = (): Order => unwrap(place([line()]));

  it("walks NEW -> CONFIRMED -> PREPARING -> READY -> SERVED -> COMPLETED, one step at a time", () => {
    let order = fresh();
    for (const status of ORDER_FLOW.slice(1)) {
      order = unwrap(moveOrderTo(order, status, LATER));
      expect(order.status).toBe(status);
      expect(order.statusChangedAt).toBe(LATER);
    }
    expect(nextStatus("COMPLETED")).toBeNull();
  });

  it("refuses skipping, going back, repeating and moving past COMPLETED", () => {
    const order = fresh();
    expect(moveOrderTo(order, "PREPARING", LATER)).toEqual({
      ok: false,
      error: { type: "INVALID_TRANSITION", from: "NEW", to: "PREPARING" },
    });
    expect(moveOrderTo(order, "NEW", LATER).ok).toBe(false);
    const confirmed = unwrap(moveOrderTo(order, "CONFIRMED", LATER));
    expect(moveOrderTo(confirmed, "NEW", LATER).ok).toBe(false);
    expect(moveOrderTo(confirmed, "CONFIRMED", LATER).ok).toBe(false);
    const done = ORDER_FLOW.slice(1).reduce((o, s) => unwrap(moveOrderTo(o, s, LATER)), order);
    for (const to of ORDER_FLOW as readonly OrderStatus[]) expect(moveOrderTo(done, to, LATER).ok).toBe(false);
  });

  it("does not change the order it was given", () => {
    const order = fresh();
    moveOrderTo(order, "CONFIRMED", LATER);
    expect(order.status).toBe("NEW");
  });

  it("asks for a customer notification only on READY", () => {
    expect(ORDER_FLOW.filter(shouldNotifyCustomer)).toEqual(["READY"]);
  });
});

describe("permissionToMoveTo", () => {
  it("COMPLETED needs payments:close, every earlier step needs orders:confirm", () => {
    expect(permissionToMoveTo("COMPLETED")).toBe("payments:close");
    for (const status of ORDER_FLOW.slice(1, -1)) expect(permissionToMoveTo(status)).toBe("orders:confirm");
  });

  it("splits the work as decided: waiter up to SERVED, cashier only the last step, owner and manager both", () => {
    const canMove = (role: Role, status: OrderStatus) => can(role, permissionToMoveTo(status));
    expect(ORDER_FLOW.slice(1).filter((s) => canMove("WAITER", s))).toEqual(["CONFIRMED", "PREPARING", "READY", "SERVED"]);
    expect(ORDER_FLOW.slice(1).filter((s) => canMove("CASHIER", s))).toEqual(["COMPLETED"]);
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(ORDER_FLOW.slice(1).every((s) => canMove(role, s))).toBe(true);
    }
  });
});
