import type { MenuError } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { can, type Permission, type Role } from "@/domain/restaurant/role";
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * Who is acting, resolved on the server from the session (getStaffContext) — never from
 * the request body. Every menu use case receives it.
 */
export type MenuActor = { restaurantId: RestaurantId; role: Role };

export type MenuUseCaseError =
  | MenuError
  | { type: "FORBIDDEN" }
  | { type: "ITEM_NOT_FOUND" };

export function requirePermission(actor: MenuActor, permission: Permission): Result<true, MenuUseCaseError> {
  return can(actor.role, permission) ? ok(true) : err({ type: "FORBIDDEN" });
}
