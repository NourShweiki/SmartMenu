import { describe, expect, it } from "vitest";
import type { StaffOrderEntry } from "@/application/use-cases/orders/get-staff-order-list";
import { ORDER_FLOW, type Order, type OrderStatus, type TableSessionId } from "@/domain/order/order";
import { buildOrderQueue } from "./order-queue-model";

// The staff queue and a takeout (pickup) order: who gets the button for the next step.

const ALI = { name: "Ali Hasan", phone: "+962791234567" };

function entry(status: OrderStatus, kind: "PICKUP" | "TABLE"): StaffOrderEntry {
  const order = { id: "order-1", number: 1, status, createdAt: new Date("2026-10-12T12:00:00Z"), totalFils: 2900, items: [] } as unknown as Order;
  const sessionId = "s-1" as TableSessionId;
  return {
    order,
    table: kind === "PICKUP" ? { sessionId, kind, label: null, customer: ALI, sessionStatus: "OPEN" } : { sessionId, kind, label: "7", customer: null, sessionStatus: "OPEN" },
  };
}
const row = (status: OrderStatus, kind: "PICKUP" | "TABLE", role: Parameters<typeof buildOrderQueue>[1]) => buildOrderQueue([entry(status, kind)], role).live[0]!;
const unfinished = ORDER_FLOW.slice(0, -1); // every status that still has a next step

describe("buildOrderQueue with a pickup order", () => {
  it("says who the order is for instead of a table", () => {
    expect(row("NEW", "PICKUP", "WAITER")).toMatchObject({ tableLabel: null, pickup: ALI });
    expect(row("NEW", "TABLE", "WAITER")).toMatchObject({ tableLabel: "7", pickup: null });
  });

  it("gives the cashier the button for every step", () => {
    expect(unfinished.map((status) => row(status, "PICKUP", "CASHIER").next)).toEqual(["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"]);
    expect(unfinished.map((status) => row(status, "PICKUP", "CASHIER").waitingFor)).toEqual([null, null, null, null, null]);
    // ...but only the last one at a table, where the earlier steps wait for the floor.
    expect(unfinished.map((status) => row(status, "TABLE", "CASHIER").next)).toEqual([null, null, null, null, "COMPLETED"]);
    expect(row("NEW", "TABLE", "CASHIER").waitingFor).toBe("floor");
  });

  it("keeps the waiter to the steps up to served, and the cashier out of cancelling", () => {
    expect(unfinished.map((status) => row(status, "PICKUP", "WAITER").next)).toEqual(["CONFIRMED", "PREPARING", "READY", "SERVED", null]);
    expect(row("SERVED", "PICKUP", "WAITER").waitingFor).toBe("cashier");
    expect(unfinished.map((status) => row(status, "PICKUP", "CASHIER").canCancel)).toEqual([false, false, false, false, false]);
  });
});
