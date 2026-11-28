import { describe, expect, it } from "vitest";
import type { StaffOrderEntry } from "@/application/use-cases/orders/get-staff-order-list";
import type { Order, OrderStatus, TableSessionId } from "@/domain/order/order";
import type { SessionStatus } from "@/domain/table-session/table-session";
import { buildKitchenBoard } from "./kitchen-board-model";

// The kitchen screen: which column each open order goes to, and what its ticket shows.

const SARA = { name: "Sara", phone: "+962791234567" };
const T0 = new Date("2026-11-27T09:00:00Z");

let n = 0;
function entry(status: OrderStatus, kind: "PICKUP" | "TABLE" | null, opts: { placedMinutesAgo?: number; sessionStatus?: SessionStatus } = {}): StaffOrderEntry {
  n += 1;
  const placed = new Date(T0.getTime() - (opts.placedMinutesAgo ?? 0) * 60_000);
  const order = {
    id: `order-${n}`,
    number: n,
    status,
    createdAt: placed,
    statusChangedAt: placed,
    totalFils: 2900,
    items: [{ quantity: 2, name: { en: "Latte", ar: "لاتيه" }, options: [{ name: { en: "Oat milk", ar: "حليب الشوفان" } }], note: "less sugar" }],
  } as unknown as Order;
  const sessionId = `s-${n}` as TableSessionId;
  const sessionStatus = opts.sessionStatus ?? "OPEN";
  const table =
    kind === null
      ? null
      : kind === "PICKUP"
        ? { sessionId, kind, label: null, customer: SARA, sessionStatus }
        : { sessionId, kind, label: "7", customer: null, sessionStatus };
  return { order, table };
}

describe("buildKitchenBoard", () => {
  it("puts each open order in its column, and leaves out what is not kitchen work", () => {
    const board = buildKitchenBoard(
      [entry("NEW", "PICKUP"), entry("CONFIRMED", "PICKUP"), entry("PREPARING", "PICKUP"), entry("READY", "PICKUP"), entry("SERVED", "PICKUP"), entry("SERVED", "TABLE")],
      "CASHIER",
    );
    expect(board.new.map((t) => t.status)).toEqual(["NEW", "CONFIRMED"]);
    expect(board.making.map((t) => t.status)).toEqual(["PREPARING"]);
    expect(board.ready.map((t) => t.status)).toEqual(["READY", "SERVED"]); // a served TABLE order waits for payment, not the kitchen
  });

  it("oldest first in every column, whatever order the list came in", () => {
    const board = buildKitchenBoard([entry("NEW", "PICKUP", { placedMinutesAgo: 1 }), entry("NEW", "PICKUP", { placedMinutesAgo: 9 }), entry("NEW", "PICKUP", { placedMinutesAgo: 4 })], "CASHIER");
    expect(board.new.map((t) => t.placedAt)).toEqual([
      new Date(T0.getTime() - 9 * 60_000).toISOString(),
      new Date(T0.getTime() - 4 * 60_000).toISOString(),
      new Date(T0.getTime() - 1 * 60_000).toISOString(),
    ]);
  });

  it("a ticket shows who it is for, the lines with their options, the total, and the times for the timer", () => {
    const [ticket] = buildKitchenBoard([entry("NEW", "PICKUP", { placedMinutesAgo: 2 })], "CASHIER").new;
    expect(ticket).toMatchObject({
      kind: "PICKUP",
      customerName: "Sara",
      tableLabel: null,
      totalFils: 2900,
      lines: [{ quantity: 2, name: { en: "Latte", ar: "لاتيه" }, options: [{ en: "Oat milk", ar: "حليب الشوفان" }], note: "less sugar" }],
      placedAt: new Date(T0.getTime() - 2 * 60_000).toISOString(),
    });
    // The phone number is not on the kitchen screen: it is for the Orders screen.
    expect(JSON.stringify(ticket)).not.toContain("962");
  });

  it("a table order shows its table; an order whose visit cannot be read counts as a table order", () => {
    const board = buildKitchenBoard([entry("NEW", "TABLE"), entry("NEW", null)], "OWNER");
    expect(board.new.map((t) => [t.kind, t.tableLabel, t.customerName])).toEqual([
      ["TABLE", "7", null],
      ["TABLE", null, null],
    ]);
  });

  it("leaves out orders of a visit that is over, table or takeout (those stay on the Orders screen)", () => {
    const board = buildKitchenBoard(
      [entry("PREPARING", "TABLE", { sessionStatus: "CLOSED" }), entry("READY", "PICKUP", { sessionStatus: "CLOSED" }), entry("PREPARING", "PICKUP", { sessionStatus: "PAYMENT_REQUESTED" })],
      "OWNER",
    );
    expect([board.new.length, board.making.length, board.ready.length]).toEqual([0, 1, 0]);
  });

  it("carries what this person's button would do (the counter: every step of a takeout order)", () => {
    const board = buildKitchenBoard([entry("NEW", "PICKUP"), entry("NEW", "TABLE")], "CASHIER");
    expect(board.new.map((t) => t.action)).toEqual([{ tap: "start", steps: ["CONFIRMED", "PREPARING"] }, null]);
  });

  it("the button's wording: Start, Ready, Picked up for takeout, Served at a table (payment comes later)", () => {
    const board = buildKitchenBoard([entry("NEW", "PICKUP"), entry("PREPARING", "PICKUP"), entry("READY", "PICKUP"), entry("READY", "TABLE")], "OWNER");
    expect([...board.new, ...board.making, ...board.ready].map((t) => t.button)).toEqual(["start", "ready", "pickedUp", "served"]);
    expect(buildKitchenBoard([entry("NEW", "TABLE")], "CASHIER").new[0]?.button).toBeNull();
  });

  it("cancelling follows the Orders screen: the counter (cashier) cancels takeout at any step, never a table order", () => {
    const cashier = buildKitchenBoard([entry("READY", "PICKUP"), entry("NEW", "TABLE")], "CASHIER");
    expect([cashier.ready[0]?.canCancel, cashier.new[0]?.canCancel]).toEqual([true, false]);
    const waiter = buildKitchenBoard([entry("NEW", "PICKUP"), entry("PREPARING", "PICKUP")], "WAITER");
    expect([waiter.new[0]?.canCancel, waiter.making[0]?.canCancel]).toEqual([true, false]);
  });
});
