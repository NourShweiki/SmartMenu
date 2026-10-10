import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLES } from "./role";

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
});
