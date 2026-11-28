export const ROLES = ["OWNER", "MANAGER", "WAITER", "CASHIER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "restaurant:settings", // modes, tax, branding, domain
  "staff:manage", // invite/remove staff, assign roles
  "menu:manage", // categories, items, prices, hide, delete
  "menu:sold-out", // mark items sold out / back in stock during service (decided 2026-10-06)
  "tables:manage", // tables + QR codes
  "orders:confirm", // confirm / move orders through statuses
  "orders:cancel", // cancel an order the kitchen has not started (NEW, CONFIRMED)
  "orders:cancel-late", // cancel an order that is being prepared, ready or served (wasted food / a refund)
  "service-requests:handle", // waiter call, cleaning
  "payments:close", // confirm payment, receipt, close session
  "reports:view", // sales, analytics, feedback
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  MANAGER: [
    "staff:manage",
    "menu:manage",
    "menu:sold-out",
    "tables:manage",
    "orders:confirm",
    "orders:cancel",
    "orders:cancel-late",
    "service-requests:handle",
    "payments:close",
    "reports:view",
  ],
  WAITER: ["orders:confirm", "orders:cancel", "service-requests:handle", "menu:sold-out"],
  // Spec: cashier handles billing/closing only, does NOT see service requests, and never cancels an order.
  CASHIER: ["payments:close"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * The roles an owner or manager can give from the staff screen. OWNER is not one of them: owners are created by the
 * founders (decided 2026-10-12).
 */
export const ASSIGNABLE_ROLES = ["MANAGER", "WAITER", "CASHIER"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(value: string): value is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * The roles the owner or manager may give at a restaurant (PROJECT_SPEC.md §3.3, Nour 2026-11-27). With tables
 * (dine-in on) all three. Without tables (a coffee shop: takeout only) there is no floor to run, so the only staff
 * role is Cashier: the counter person, who works the kitchen screen; the owner is the one management account.
 * Somebody who already has another role there keeps it until it is changed (to Cashier) or they are removed.
 */
export function offeredRoles(restaurant: { readonly dineInEnabled: boolean }): readonly AssignableRole[] {
  return restaurant.dineInEnabled ? ASSIGNABLE_ROLES : ["CASHIER"];
}

/**
 * Where a member of staff lands after signing in. The counter person of a shop without tables (Cashier, dine-in off)
 * goes straight to the kitchen screen, which is all their day is (spec §3.3); everyone else to the staff dashboard.
 * The dashboard stays reachable from the kitchen screen ("Staff dashboard"), e.g. to change one's password.
 */
export function landingScreen(role: Role, restaurant: { readonly dineInEnabled: boolean }): "kitchen" | "dashboard" {
  return role === "CASHIER" && !restaurant.dineInEnabled ? "kitchen" : "dashboard";
}
