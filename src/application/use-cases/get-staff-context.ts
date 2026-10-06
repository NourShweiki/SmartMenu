import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import type { AuthGateway } from "@/application/ports/auth-gateway";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { SignedInStaff } from "./sign-in-staff";

export type GetStaffContextError = { type: "NOT_SIGNED_IN" } | { type: "NOT_A_MEMBER" };

/** Who is using a staff screen of this restaurant, and with which role. Every staff page starts here. */
export function makeGetStaffContext(deps: { auth: AuthGateway; memberships: MembershipRepository }) {
  return async (input: { restaurantId: RestaurantId }): Promise<Result<SignedInStaff, GetStaffContextError>> => {
    const userId = await deps.auth.currentUserId();
    if (!userId) return err({ type: "NOT_SIGNED_IN" });

    const role = await deps.memberships.findRole(input.restaurantId, userId);
    if (!role) return err({ type: "NOT_A_MEMBER" });
    return ok({ userId, restaurantId: input.restaurantId, role });
  };
}
