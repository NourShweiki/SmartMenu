import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { can, type Permission, type Role } from "@/domain/restaurant/role";
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * Who is acting, resolved on the server from the session (getStaffContext) — never from the request
 * body. Every staff use case receives it.
 */
export type StaffActor = { restaurantId: RestaurantId; role: Role };

export type ForbiddenError = { type: "FORBIDDEN" };

/** The single permission check for staff use cases (the database applies RLS again on top). */
export function requirePermission(actor: StaffActor, permission: Permission): Result<true, ForbiddenError> {
  return can(actor.role, permission) ? ok(true) : err({ type: "FORBIDDEN" });
}
