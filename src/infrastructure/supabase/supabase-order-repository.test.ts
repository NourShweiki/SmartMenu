import { describe, expect, it } from "vitest";
import type { Order } from "@/domain/order/order";
import { toOrder, toPlaceOrderPayload, type OrderRow } from "./supabase-order-repository";

const row: OrderRow = {
  id: "aaaaaaaa-4444-4000-8000-000000000001",
  restaurant_id: "11111111-1111-4000-8000-000000000001",
  session_id: "33333333-3333-4000-8000-000000000003",
  number: 7,
  status: "PREPARING",
  subtotal_fils: 6000,
  service_charge_fils: 600,
  tax_fils: 1056,
  total_fils: 7656,
  tax_rate_bp: 1600,
  service_charge_bp: 1000,
  created_at: "2026-10-10T12:00:00.000Z",
  status_changed_at: "2026-10-10T12:05:00.000Z",
  // Deliberately out of order: the mapper must sort by position.
  order_items: [
    {
      id: "item-2",
      menu_item_id: "m-2",
      name_en: "Hummus",
      name_ar: "حمص",
      unit_price_fils: 1250,
      quantity: 1,
      line_total_fils: 1250,
      position: 1,
      order_item_options: [],
    },
    {
      id: "item-1",
      menu_item_id: "m-1",
      name_en: "Kebab",
      name_ar: "كباب",
      unit_price_fils: 2500,
      quantity: 2,
      line_total_fils: 6000,
      position: 0,
      order_item_options: [
        { option_id: "o-2", group_name_en: "Extras", group_name_ar: "إضافات", name_en: "Cheese", name_ar: "جبنة", price_delta_fils: 300, position: 1 },
        { option_id: "o-1", group_name_en: "Size", group_name_ar: "الحجم", name_en: "Large", name_ar: "كبير", price_delta_fils: 500, position: 0 },
      ],
    },
  ],
};

describe("toOrder", () => {
  const order = toOrder(row);

  it("maps the columns to the domain shape", () => {
    expect(order).toMatchObject({
      id: row.id,
      restaurantId: row.restaurant_id,
      sessionId: row.session_id,
      number: 7,
      status: "PREPARING",
      subtotalFils: 6000,
      serviceChargeFils: 600,
      taxFils: 1056,
      totalFils: 7656,
      taxRateBp: 1600,
      serviceChargeBp: 1000,
    });
    expect(order.createdAt).toEqual(new Date("2026-10-10T12:00:00.000Z"));
    expect(order.statusChangedAt).toEqual(new Date("2026-10-10T12:05:00.000Z"));
  });

  it("keeps lines and options in the order they were ordered (by position)", () => {
    expect(order.items.map((i) => i.name.en)).toEqual(["Kebab", "Hummus"]);
    expect(order.items[0]!.options.map((o) => o.name.en)).toEqual(["Large", "Cheese"]);
    expect(order.items[0]!.options[0]).toEqual({
      optionId: "o-1",
      groupName: { en: "Size", ar: "الحجم" },
      name: { en: "Large", ar: "كبير" },
      priceDeltaFils: 500,
    });
  });

  it("turns bigint-as-string-free numbers into plain whole fils", () => {
    expect(Number.isInteger(order.totalFils)).toBe(true);
    expect(order.items[0]!.lineTotalFils).toBe(6000);
  });
});

describe("toPlaceOrderPayload", () => {
  const order: Order = { ...toOrder(row), status: "NEW" };
  const payload = toPlaceOrderPayload(order);

  it("sends the amounts and rates the domain computed", () => {
    expect(payload).toMatchObject({
      id: row.id,
      restaurant_id: row.restaurant_id,
      session_id: row.session_id,
      number: 7,
      tax_rate_bp: 1600,
      service_charge_bp: 1000,
      subtotal_fils: 6000,
      service_charge_fils: 600,
      tax_fils: 1056,
      total_fils: 7656,
      created_at: "2026-10-10T12:00:00.000Z",
    });
  });

  it("keeps the array order of lines and options (it becomes their position)", () => {
    expect(payload.items.map((i) => i.name_en)).toEqual(["Kebab", "Hummus"]);
    expect(payload.items[0]!.options.map((o) => o.name_en)).toEqual(["Large", "Cheese"]);
    expect(payload.items[0]).toMatchObject({ menu_item_id: "m-1", unit_price_fils: 2500, quantity: 2, line_total_fils: 6000 });
    expect(payload.items[0]!.options[1]).toEqual({
      option_id: "o-2",
      group_name_en: "Extras",
      group_name_ar: "إضافات",
      name_en: "Cheese",
      name_ar: "جبنة",
      price_delta_fils: 300,
    });
  });

  it("round-trips: payload -> rows -> order equals the original", () => {
    const back = toOrder({
      ...row,
      status: "NEW",
      status_changed_at: row.created_at,
      order_items: payload.items.map((item, i) => ({
        id: item.id,
        menu_item_id: item.menu_item_id,
        name_en: item.name_en,
        name_ar: item.name_ar,
        unit_price_fils: item.unit_price_fils,
        quantity: item.quantity,
        line_total_fils: item.line_total_fils,
        position: i,
        order_item_options: item.options.map((o, j) => ({ ...o, position: j })),
      })),
    });
    expect(back).toEqual({ ...order, statusChangedAt: order.createdAt });
  });
});
