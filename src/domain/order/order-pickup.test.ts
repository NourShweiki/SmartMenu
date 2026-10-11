import { describe, expect, it } from "vitest";
import { can, ROLES } from "@/domain/restaurant/role";
import { calculateTotals, ORDER_FLOW, permissionsToMoveTo, pickupRates, type OrderStatus } from "./order";

describe("pickupRates", () => {
  it("drops the service charge and keeps the tax", () => {
    const rates = pickupRates({ taxRateBp: 1600, serviceChargeBp: 1000 });
    expect(rates).toEqual({ taxRateBp: 1600, serviceChargeBp: 0 });
    // 2.500 at a table: 0.250 service, tax on 2.750 = 0.440, total 3.190. As takeout: tax on 2.500 = 0.400, total 2.900.
    expect(calculateTotals(2500, { taxRateBp: 1600, serviceChargeBp: 1000 }).totalFils).toBe(3190);
    expect(calculateTotals(2500, rates)).toMatchObject({ serviceChargeFils: 0, taxFils: 400, totalFils: 2900 });
  });
});

describe("who moves an order, by kind of visit", () => {
  const mayMove = (role: (typeof ROLES)[number], status: OrderStatus, kind: "TABLE" | "PICKUP") => permissionsToMoveTo(status, kind).some((p) => can(role, p));
  const steps = ORDER_FLOW.slice(1); // every status an order can be moved TO

  it("at a table: the waiter up to served, the cashier only completes", () => {
    for (const step of steps) {
      expect(mayMove("WAITER", step, "TABLE")).toBe(step !== "COMPLETED");
      expect(mayMove("CASHIER", step, "TABLE")).toBe(step === "COMPLETED");
    }
  });

  it("on a pickup order: the cashier does every step, the waiter still up to served", () => {
    for (const step of steps) {
      expect(mayMove("CASHIER", step, "PICKUP")).toBe(true);
      expect(mayMove("WAITER", step, "PICKUP")).toBe(step !== "COMPLETED");
    }
  });

  it("owner and manager do every step of both", () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      for (const step of steps) for (const kind of ["TABLE", "PICKUP"] as const) expect(mayMove(role, step, kind)).toBe(true);
    }
  });
});
