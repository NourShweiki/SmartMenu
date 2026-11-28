import { describe, expect, it } from "vitest";
import { can, landingScreen, offeredRoles, PERMISSIONS, ROLES } from "./role";

describe("role permissions", () => {
  it("only the owner may change restaurant settings (the settings screen and its action rely on this)", () => {
    expect(ROLES.filter((role) => can(role, "restaurant:settings"))).toEqual(["OWNER"]);
  });

  it("the owner can do everything", () => {
    for (const permission of PERMISSIONS) expect(can("OWNER", permission)).toBe(true);
  });

  it("cashiers handle payments only and waiters cannot edit the menu", () => {
    expect(PERMISSIONS.filter((p) => can("CASHIER", p))).toEqual(["payments:close"]);
    expect(can("WAITER", "menu:manage")).toBe(false);
    expect(can("WAITER", "menu:sold-out")).toBe(true);
  });

  it("cancelling: the waiter before the kitchen starts, owner and manager also later, the cashier never", () => {
    expect(ROLES.filter((role) => can(role, "orders:cancel"))).toEqual(["OWNER", "MANAGER", "WAITER"]);
    expect(ROLES.filter((role) => can(role, "orders:cancel-late"))).toEqual(["OWNER", "MANAGER"]);
  });
});

describe("a shop without tables (coffee shop, spec §3.3)", () => {
  it("offers only Cashier as a staff role; with tables all three", () => {
    expect(offeredRoles({ dineInEnabled: false })).toEqual(["CASHIER"]);
    expect(offeredRoles({ dineInEnabled: true })).toEqual(["MANAGER", "WAITER", "CASHIER"]);
  });

  it("the cashier there lands on the kitchen screen after signing in; everyone else, and every role with tables, on the dashboard", () => {
    expect(landingScreen("CASHIER", { dineInEnabled: false })).toBe("kitchen");
    for (const role of ["OWNER", "MANAGER", "WAITER"] as const) expect(landingScreen(role, { dineInEnabled: false })).toBe("dashboard");
    for (const role of ROLES) expect(landingScreen(role, { dineInEnabled: true })).toBe("dashboard");
  });
});
