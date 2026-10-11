import { describe, expect, it } from "vitest";
import type { SessionAtTable } from "@/application/ports/table-session-repository";
import type { Order, OrderStatus } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { SessionStatus, TableId, TableSessionId } from "@/domain/table-session/table-session";
import { makeGetOpenVisits } from "./get-open-visits";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const OTHER = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const S1 = "33333333-3333-4000-8000-000000000001" as TableSessionId;
const S2 = "33333333-3333-4000-8000-000000000002" as TableSessionId;
const NOW = new Date("2026-10-11T20:00:00Z");
const clock = { now: () => NOW };
const actor = { restaurantId: R, role: "CASHIER" } as const;

const visit = (id: TableSessionId, label: string, status: SessionStatus = "OPEN", minutesAgo = 30, restaurantId = R): SessionAtTable => ({
  tableLabel: label,
  session: { id, restaurantId, kind: "TABLE", tableId: `table-${label}` as TableId, customer: null, status, startedAt: new Date(NOW.getTime() - minutesAgo * 60_000), endedAt: null },
});
/** An order as far as a bill goes: 1.000 + 0.100 service + 0.176 tax = 1.276, times `units`. */
const order = (number: number, sessionId: TableSessionId, status: OrderStatus, units = 1, restaurantId = R) =>
  ({
    id: `order-${number}`,
    number,
    restaurantId,
    sessionId,
    status,
    subtotalFils: 1000 * units,
    serviceChargeFils: 100 * units,
    taxFils: 176 * units,
    totalFils: 1276 * units,
  }) as unknown as Order;

function setup(visits: SessionAtTable[], orders: Order[]) {
  const asked = { live: 0, orders: [] as string[][] };
  const get = makeGetOpenVisits({
    sessions: {
      listLive: async () => {
        asked.live++;
        return visits;
      },
    },
    orders: {
      listBySessions: async (_restaurantId, sessionIds) => {
        asked.orders.push([...sessionIds]);
        return orders.filter((o) => sessionIds.includes(o.sessionId));
      },
    },
    clock,
  });
  return { get, asked };
}

describe("getOpenVisits", () => {
  it("lists every visit that is not closed with its orders, running bill and how many orders are unfinished", async () => {
    const { get, asked } = setup(
      [visit(S1, "7"), visit(S2, "Terrace", "PAYMENT_REQUESTED")],
      [order(1, S1, "COMPLETED"), order(2, S1, "PREPARING", 2), order(3, S2, "SERVED"), order(4, S1, "NEW")],
    );
    const visits = await get(actor);

    expect(visits.map((v) => [v.tableLabel, v.status, v.orders.map((o) => o.number), v.unfinished])).toEqual([
      ["7", "OPEN", [1, 2, 4], 2],
      ["Terrace", "PAYMENT_REQUESTED", [3], 1],
    ]);
    // The bill is the sum of the orders as they were priced (completed ones are on it too): 1 + 2 + 1 units.
    expect(visits[0]?.bill).toEqual({ subtotalFils: 4000, serviceChargeFils: 400, taxFils: 704, totalFils: 5104 });
    expect(visits[1]?.bill.totalFils).toBe(1276);
    expect(asked).toEqual({ live: 1, orders: [[S1, S2]] }); // two questions for the whole screen
  });

  it("shows a table without orders (the guests only scanned), with an empty bill", async () => {
    const [only] = await setup([visit(S1, "7")], []).get(actor);
    expect(only).toMatchObject({ tableLabel: "7", orders: [], unfinished: 0, bill: { subtotalFils: 0, serviceChargeFils: 0, taxFils: 0, totalFils: 0 } });
  });

  it("keeps a visit that ran past its two hours on the list, as CLOSED, until staff close it", async () => {
    const [stale] = await setup([visit(S1, "7", "OPEN", 121)], [order(1, S1, "SERVED")]).get(actor);
    expect([stale?.status, stale?.session.status, stale?.unfinished]).toEqual(["CLOSED", "OPEN", 1]);
  });

  it("never mixes in another restaurant's visit or order, whatever the store hands back", async () => {
    const { get } = setup([visit(S1, "7"), visit(S2, "Not ours", "OPEN", 30, OTHER)], [order(1, S1, "NEW"), order(2, S1, "NEW", 1, OTHER)]);
    const visits = await get(actor);
    expect(visits.map((v) => [v.tableLabel, v.orders.map((o) => o.number)])).toEqual([["7", [1]]]);
  });

  it("does not ask for orders when no table is open", async () => {
    const { get, asked } = setup([], [order(1, S1, "NEW")]);
    expect(await get(actor)).toEqual([]);
    expect(asked.orders).toEqual([]);
  });
});
