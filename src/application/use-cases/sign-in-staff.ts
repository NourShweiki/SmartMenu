import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import { err, ok, type Result } from "@/domain/shared/result";
import type { AuthGateway, SignInError, UserId } from "@/application/ports/auth-gateway";
import type { MembershipRepository } from "@/application/ports/membership-repository";

export type SignInStaffInput = { restaurantId: RestaurantId; email: string; password: string };
export type SignedInStaff = { userId: UserId; restaurantId: RestaurantId; role: Role };

/**
 * Staff sign in on their restaurant's site. Someone with a valid account but no role in
 * THIS restaurant is signed straight out and gets the same error as a wrong password,
 * so the login form never reveals which emails exist elsewhere.
 */
export function makeSignInStaff(deps: { auth: AuthGateway; memberships: MembershipRepository }) {
  return async (input: SignInStaffInput): Promise<Result<SignedInStaff, SignInError>> => {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) return err({ type: "INVALID_CREDENTIALS" });

    const signedIn = await deps.auth.signInWithPassword(email, input.password);
    if (!signedIn.ok) return signedIn;

    const { userId } = signedIn.value;
    const role = await deps.memberships.findRole(input.restaurantId, userId);
    if (!role) {
      await deps.auth.signOut();
      return err({ type: "INVALID_CREDENTIALS" });
    }
    return ok({ userId, restaurantId: input.restaurantId, role });
  };
}
