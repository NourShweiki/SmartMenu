import { describe, expect, it } from "vitest";
import type { StaffOrderEntry } from "@/application/use-cases/orders/get-staff-order-list";
import type { Order, OrderStatus } from "@/domain/order/order";
import { ROLES } from "@/domain/restaurant/role";
import type { SessionStatus, TableSessionId } from "@/domain/table-session/table-session";
import { buildOrderQueue } from "./order-queue-model";

const SESSION = "33333333-3333-4000-8000-000000000003" as TableSessionId;

function entry(number: number, status: OrderStatus, visit: SessionStatus | null = "OPEN", label = "7"): StaffOrderEntry {
  const order = {
    id: `order-${number}`,
    number,
    status,
    sessionId: SESSION,
    createdAt: new Date(`2026-10-11T18:0${number}:00Z`),
    totalFils: 7656,
    items: [
      {
        quantity: 2,
        name: { en: "Kebab", ar: "كباب" },
        options: [{ name: { en: "Large", ar: "كبير" } }, { name: { en: "Garlic sauce", ar: "ثومية" } }],
      },
      { quantity: 1, name: { en: "Hummus", ar: "حمص" }, options: [] },
    ],
  } as unknown as Order;
  return { order, table: visit ? { sessionId: SESSION, kind: "TABLE" as const, label, customer: null, sessionStatus: visit } : null };
}

describe("buildOrderQueue", () => {
  it("shows what an order needs: number, table, time, lines with choices, total", () => {
    const { live } = buildOrderQueue([entry(1, "NEW")], "WAITER");
    expect(live).toEqual([
      {
        id: "order-1",
        number: 1,
        status: "NEW",
        tableLabel: "7",
        pickup: null,
        visit: null,
        placedAt: new Date("2026-10-11T18:01:00Z"),
        lines: [
          { quantity: 2, name: { en: "Kebab", ar: "كباب" }, options: [{ en: "Large", ar: "كبير" }, { en: "Garlic sauce", ar: "ثومية" }] },
          { quantity: 1, name: { en: "Hummus", ar: "حمص" }, options: [] },
        ],
        totalFils: 7656,
        next: "CONFIRMED",
        waitingFor: null,
        canCancel: true,
      },
    ]);
  });

  it("offers Cancel to the waiter before the kitchen starts, to owner and manager until completed, never to the cashier", () => {
    const statuses = ["NEW", "CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"] as const;
    const offered = (role: (typeof ROLES)[number]) => buildOrderQueue(statuses.map((s, i) => entry(i, s)), role).live.map((o) => o.canCancel);
    expect(offered("WAITER")).toEqual([true, true, false, false, false, false]);
    expect(offered("OWNER")).toEqual([true, true, true, true, true, false]);
    expect(offered("MANAGER")).toEqual([true, true, true, true, true, false]);
    expect(offered("CASHIER")).toEqual([false, false, false, false, false, false]);
    // Leftover orders of visits that are over can be cancelled the same way: that is how they get settled.
    expect(buildOrderQueue([entry(1, "NEW", "CLOSED")], "WAITER").ended.map((o) => o.canCancel)).toEqual([true]);
  });

  it("gives each role exactly its own button: the floor up to SERVED, the cashier only COMPLETED, owner and manager both", () => {
    const statuses = ["NEW", "CONFIRMED", "PREPARING", "READY", "SERVED"] as const;
    const buttons = (role: (typeof ROLES)[number]) => buildOrderQueue(statuses.map((s, i) => entry(i, s)), role).live.map((o) => o.next);
    const hints = (role: (typeof ROLES)[number]) => buildOrderQueue(statuses.map((s, i) => entry(i, s)), role).live.map((o) => o.waitingFor);

    expect(buttons("WAITER")).toEqual(["CONFIRMED", "PREPARING", "READY", "SERVED", null]);
    expect(hints("WAITER")).toEqual([null, null, null, null, "cashier"]); // served: waits for payment
    expect(buttons("CASHIER")).toEqual([null, null, null, null, "COMPLETED"]);
    expect(hints("CASHIER")).toEqual(["floor", "floor", "floor", "floor", null]);
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(buttons(role)).toEqual(["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"]);
      expect(hints(role)).toEqual([null, null, null, null, null]);
    }
  });

  it("badges a table that asked for the bill, and keeps it in the live queue", () => {
    const { live, ended } = buildOrderQueue([entry(1, "READY", "PAYMENT_REQUESTED")], "WAITER");
    expect(live.map((o) => [o.number, o.visit, o.next])).toEqual([[1, "paymentRequested", "SERVED"]]);
    expect(ended).toEqual([]);
  });

  it("moves unfinished orders of visits that are over into their own group, still with their button", () => {
    const { live, ended } = buildOrderQueue(
      [entry(1, "NEW", "CLOSED", "3"), entry(2, "PREPARING"), entry(3, "SERVED", "CLOSED", "3"), entry(4, "NEW")],
      "OWNER",
    );
    expect(live.map((o) => o.number)).toEqual([2, 4]); // the order they came in is kept
    expect(ended.map((o) => [o.number, o.tableLabel, o.visit, o.next])).toEqual([
      [1, "3", "ended", "CONFIRMED"],
      [3, "3", "ended", "COMPLETED"],
    ]);
  });

  it("still shows an order whose table could not be read, in the live queue", () => {
    const { live, ended } = buildOrderQueue([entry(1, "NEW", null)], "WAITER");
    expect(live.map((o) => [o.tableLabel, o.visit, o.next])).toEqual([[null, null, "CONFIRMED"]]);
    expect(ended).toEqual([]);
  });

  it("has nothing to offer for a completed order (it only shows on a table's bill)", () => {
    for (const role of ROLES) {
      const [row] = buildOrderQueue([entry(1, "COMPLETED")], role).live;
      expect([row?.next, row?.waitingFor]).toEqual([null, null]);
    }
  });
});
