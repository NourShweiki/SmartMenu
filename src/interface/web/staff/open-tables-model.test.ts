import { describe, expect, it } from "vitest";
import type { OpenVisit } from "@/application/use-cases/tables/get-open-visits";
import type { Order, OrderStatus } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { ROLES } from "@/domain/restaurant/role";
import type { SessionStatus, TableId, TableSessionId } from "@/domain/table-session/table-session";
import { buildOpenTables } from "./open-tables-model";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const START = new Date("2026-10-11T18:05:00Z");

/** A visit as the use case hands it over. `status` is the effective one; `stored` what the record says. */
function visit(label: string, status: SessionStatus, orders: OrderStatus[] = [], stored: SessionStatus = status): OpenVisit {
  const list = orders.map((s, i) => ({ id: `order-${i + 1}`, number: i + 1, status: s, totalFils: 1276 }) as unknown as Order);
  return {
    session: { id: `session-${label}` as TableSessionId, restaurantId: R, tableId: `table-${label}` as TableId, status: stored, startedAt: START, endedAt: null },
    tableLabel: label,
    status,
    orders: list,
    bill: { subtotalFils: 1000 * list.length, serviceChargeFils: 100 * list.length, taxFils: 176 * list.length, totalFils: 1276 * list.length } as OpenVisit["bill"],
    unfinished: orders.filter((s) => s !== "COMPLETED").length,
  };
}

describe("buildOpenTables", () => {
  it("shows a table with its orders, bill and start time", () => {
    const [row] = buildOpenTables([visit("7", "OPEN", ["COMPLETED", "SERVED"])], "OWNER");
    expect(row).toEqual({
      sessionId: "session-7",
      tableLabel: "7",
      state: "open",
      startedAt: START,
      orders: [
        { id: "order-1", number: 1, status: "COMPLETED", totalFils: 1276 },
        { id: "order-2", number: 2, status: "SERVED", totalFils: 1276 },
      ],
      bill: { subtotalFils: 2000, serviceChargeFils: 200, taxFils: 352, totalFils: 2552 },
      canRequestPayment: true,
      close: "unfinished",
      unfinished: 1,
    });
  });

  it("offers 'ready to pay' to the floor, owner and manager, only while the visit is open", () => {
    const visits = [visit("1", "OPEN"), visit("2", "PAYMENT_REQUESTED"), visit("3", "CLOSED", [], "OPEN")];
    const offered = (role: (typeof ROLES)[number]) => buildOpenTables(visits, role).map((r) => r.canRequestPayment);
    expect(offered("WAITER")).toEqual([true, false, false]);
    expect(offered("OWNER")).toEqual([true, false, false]);
    expect(offered("MANAGER")).toEqual([true, false, false]);
    expect(offered("CASHIER")).toEqual([false, false, false]); // signalling is the floor's
  });

  it("lets the cashier, owner and manager close a table once every order is completed; never the waiter", () => {
    const visits = [visit("1", "PAYMENT_REQUESTED", ["COMPLETED", "COMPLETED"]), visit("2", "PAYMENT_REQUESTED", ["COMPLETED", "READY"]), visit("3", "OPEN")];
    const closing = (role: (typeof ROLES)[number]) => buildOpenTables(visits, role).map((r) => r.close);
    for (const role of ["CASHIER", "OWNER", "MANAGER"] as const) expect(closing(role)).toEqual(["allowed", "unfinished", "allowed"]);
    expect(closing("WAITER")).toEqual(["notYours", "notYours", "notYours"]);
  });

  it("marks a visit past its two hours as timed out, whatever its record says", () => {
    const rows = buildOpenTables([visit("1", "CLOSED", ["NEW"], "OPEN"), visit("2", "CLOSED", [], "PAYMENT_REQUESTED")], "CASHIER");
    expect(rows.map((r) => [r.state, r.close, r.unfinished])).toEqual([
      ["timedOut", "unfinished", 1],
      ["timedOut", "allowed", 0],
    ]);
  });

  it("keeps the order the visits came in (oldest first)", () => {
    expect(buildOpenTables([visit("9", "OPEN"), visit("2", "OPEN"), visit("5", "OPEN")], "WAITER").map((r) => r.tableLabel)).toEqual(["9", "2", "5"]);
  });
});
