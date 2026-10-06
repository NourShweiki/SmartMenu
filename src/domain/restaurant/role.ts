export const ROLES = ["OWNER", "MANAGER", "WAITER", "CASHIER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "restaurant:settings", // modes, tax, branding, domain
  "staff:manage", // invite/remove staff, assign roles
  "menu:manage", // categories, items, prices, hide, delete
  "menu:sold-out", // mark items sold out / back in stock during service (decided 2026-10-06)
  "tables:manage", // tables + QR codes
  "orders:confirm", // confirm / move orders through statuses
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
    "service-requests:handle",
    "payments:close",
    "reports:view",
  ],
  WAITER: ["orders:confirm", "service-requests:handle", "menu:sold-out"],
  // Spec: cashier handles billing/closing only and does NOT see service requests.
  CASHIER: ["payments:close"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
