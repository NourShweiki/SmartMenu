import { describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { PERMISSIONS, ROLES, type Permission, type Role } from "@/domain/restaurant/role";
import { requirePermission } from "./permissions";

const RESTAURANT = "11111111-1111-4000-8000-000000000001" as RestaurantId;

// The whole table of who may do what (PROJECT_SPEC.md §4 "Staff roles", §5 "Roles"). It is written out in full on
// purpose: changing a role's rights must be a deliberate edit of this table, never a side effect of another change.
// The database applies the same rules again (pgTAP), so a change here usually needs a migration too.
const EXPECTED: Record<Permission, readonly Role[]> = {
  "restaurant:settings": ["OWNER"], // only the owner changes settings and branding
  "staff:manage": ["OWNER", "MANAGER"],
  "menu:manage": ["OWNER", "MANAGER"],
  "menu:sold-out": ["OWNER", "MANAGER", "WAITER"], // waiters mark sold out during service
  "tables:manage": ["OWNER", "MANAGER"],
  "orders:confirm": ["OWNER", "MANAGER", "WAITER"], // the cashier's single step (COMPLETED) is decided per status
  "orders:cancel": ["OWNER", "MANAGER", "WAITER"], // waiter: only before the kitchen starts
  "orders:cancel-late": ["OWNER", "MANAGER"], // preparing / ready / served: wasted food or a refund
  "service-requests:handle": ["OWNER", "MANAGER", "WAITER"], // the cashier does not see service requests
  "payments:close": ["OWNER", "MANAGER", "CASHIER"], // the waiter only signals "ready to pay"
  "reports:view": ["OWNER", "MANAGER"],
};

describe("requirePermission: the spec's table of who may do what", () => {
  it("covers every permission the app knows (a new permission must be added to this table)", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PERMISSIONS].sort());
  });

  for (const permission of PERMISSIONS) {
    for (const role of ROLES) {
      const allowed = EXPECTED[permission].includes(role);
      it(`${role} ${allowed ? "may" : "may NOT"} ${permission}`, () => {
        const result = requirePermission({ restaurantId: RESTAURANT, role }, permission);
        expect(result.ok).toBe(allowed);
        if (!result.ok) expect(result.error).toEqual({ type: "FORBIDDEN" });
      });
    }
  }

  it("the cashier never cancels and never handles service requests", () => {
    for (const permission of ["orders:cancel", "orders:cancel-late", "service-requests:handle"] as const) {
      expect(requirePermission({ restaurantId: RESTAURANT, role: "CASHIER" }, permission).ok).toBe(false);
    }
  });
});
