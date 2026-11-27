import { describe, expect, it } from "vitest";
import { ROLES } from "@/domain/restaurant/role";
import {
  kitchenAction,
  kitchenColumn,
  kitchenTimer,
  secondsSince,
  timerLevel,
  KITCHEN_AMBER_AFTER_MINUTES,
  KITCHEN_RED_AFTER_MINUTES,
} from "./kitchen-board";
import { nextStatus, ORDER_STATUSES, type OrderStatus } from "./order";

describe("kitchen board: columns", () => {
  it("not started, making, ready; finished orders are not kitchen work", () => {
    const expected: Record<OrderStatus, [string | null, string | null]> = {
      // status: [takeout, table]
      NEW: ["new", "new"],
      CONFIRMED: ["new", "new"],
      PREPARING: ["making", "making"],
      READY: ["ready", "ready"],
      SERVED: ["ready", null], // a handed-over takeout order still needs "Picked up"; a served table pays at open tables
      COMPLETED: [null, null],
      CANCELLED: [null, null],
    };
    for (const status of ORDER_STATUSES) {
      expect([kitchenColumn(status, "PICKUP"), kitchenColumn(status, "TABLE")]).toEqual(expected[status]);
    }
  });
});

describe("kitchen board: what a tap does (spec §3.3: three taps per order)", () => {
  it("at the coffee-shop counter the cashier's three taps take a takeout order from new to completed", () => {
    expect(kitchenAction("NEW", "PICKUP", "CASHIER")).toEqual({ tap: "start", steps: ["CONFIRMED", "PREPARING"] });
    expect(kitchenAction("PREPARING", "PICKUP", "CASHIER")).toEqual({ tap: "ready", steps: ["READY"] });
    expect(kitchenAction("READY", "PICKUP", "CASHIER")).toEqual({ tap: "pickedUp", steps: ["SERVED", "COMPLETED"] });
  });

  it("an order confirmed elsewhere (the Orders list) is started with one step, a handed-over one completed with one", () => {
    expect(kitchenAction("CONFIRMED", "PICKUP", "CASHIER")).toEqual({ tap: "start", steps: ["PREPARING"] });
    expect(kitchenAction("SERVED", "PICKUP", "CASHIER")).toEqual({ tap: "pickedUp", steps: ["COMPLETED"] });
  });

  it("owner and manager take every step of a takeout order too", () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(kitchenAction("NEW", "PICKUP", role)?.steps).toEqual(["CONFIRMED", "PREPARING"]);
      expect(kitchenAction("READY", "PICKUP", role)?.steps).toEqual(["SERVED", "COMPLETED"]);
    }
  });

  it("a tap stops at the first step the role may not take: the waiter hands a takeout order over, never completes it", () => {
    expect(kitchenAction("READY", "PICKUP", "WAITER")).toEqual({ tap: "pickedUp", steps: ["SERVED"] });
    expect(kitchenAction("SERVED", "PICKUP", "WAITER")).toBeNull();
  });

  it("at a table 'Picked up' means served, even for the owner: completing happens after payment, at the open tables", () => {
    for (const role of ["OWNER", "MANAGER", "WAITER"] as const) {
      expect(kitchenAction("READY", "TABLE", role)).toEqual({ tap: "pickedUp", steps: ["SERVED"] });
    }
  });

  it("the cashier has no button on a table order (the floor moves those)", () => {
    for (const status of ORDER_STATUSES) expect(kitchenAction(status, "TABLE", "CASHIER")).toBeNull();
  });

  it("finished orders have no button for anybody", () => {
    for (const role of ROLES) {
      for (const kind of ["PICKUP", "TABLE"] as const) {
        expect(kitchenAction("COMPLETED", kind, role)).toBeNull();
        expect(kitchenAction("CANCELLED", kind, role)).toBeNull();
      }
    }
  });

  it("every tap only bundles steps of the flow, one after another (the rules of spec §4 do not change)", () => {
    for (const role of ROLES) {
      for (const kind of ["PICKUP", "TABLE"] as const) {
        for (const status of ORDER_STATUSES) {
          const action = kitchenAction(status, kind, role);
          if (!action) continue;
          expect(action.steps.length).toBeGreaterThan(0);
          let from: OrderStatus = status;
          for (const step of action.steps) {
            expect(step).toBe(nextStatus(from));
            from = step;
          }
        }
      }
    }
  });
});

describe("kitchen board: the timer", () => {
  const placed = new Date("2026-11-27T09:00:00Z");
  const at = (seconds: number) => new Date(placed.getTime() + seconds * 1000);

  it("fixed colours: green under 3 minutes, amber from 3, red from 6", () => {
    expect(KITCHEN_AMBER_AFTER_MINUTES).toBe(3);
    expect(KITCHEN_RED_AFTER_MINUTES).toBe(6);
    expect(timerLevel(0)).toBe("green");
    expect(timerLevel(179)).toBe("green");
    expect(timerLevel(180)).toBe("amber");
    expect(timerLevel(359)).toBe("amber");
    expect(timerLevel(360)).toBe("red");
    expect(timerLevel(3600)).toBe("red");
  });

  it("counts whole seconds and never goes below zero", () => {
    expect(secondsSince(placed, at(61.9))).toBe(61);
    expect(secondsSince(placed, at(-5))).toBe(0);
  });

  it("counts from the moment the order was placed while it is new or being made", () => {
    const order = { status: "PREPARING" as const, createdAt: placed, statusChangedAt: at(100) };
    expect(kitchenTimer(order, "PICKUP", at(200))).toEqual({ kind: "sincePlaced", seconds: 200, level: "amber" });
  });

  it("once ready it shows how long the order has waited for pickup, without a colour", () => {
    const order = { status: "READY" as const, createdAt: placed, statusChangedAt: at(300) };
    expect(kitchenTimer(order, "PICKUP", at(420))).toEqual({ kind: "waitingForPickup", seconds: 120 });
  });
});
