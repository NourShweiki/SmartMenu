import type { AuthGateway, SignInError, UserId } from "@/application/ports/auth-gateway";
import type { PlatformAdminRepository } from "@/application/ports/platform-admin-repository";
import type { RestaurantDirectory, RestaurantOwner, RestaurantSummary } from "@/application/ports/restaurant-directory";
import { err, ok, type Result } from "@/domain/shared/result";

export type Founder = { userId: UserId };
export type FounderAccessError = { type: "NOT_SIGNED_IN" } | { type: "NOT_A_FOUNDER" };

type AccessDeps = { auth: AuthGateway; admins: PlatformAdminRepository };

/**
 * Founders sign in on the platform's own address (no restaurant). Somebody with a valid account who is not a
 * founder (any restaurant's staff) is signed straight out and gets the same answer as a wrong password, so the
 * form never tells who has an account.
 */
export function makeSignInFounder(deps: AccessDeps) {
  return async (input: { email: string; password: string }): Promise<Result<Founder, SignInError>> => {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) return err({ type: "INVALID_CREDENTIALS" });

    const signedIn = await deps.auth.signInWithPassword(email, input.password);
    if (!signedIn.ok) return signedIn;
    if (!(await deps.admins.isAdmin(signedIn.value.userId))) {
      await deps.auth.signOut();
      return err({ type: "INVALID_CREDENTIALS" });
    }
    return ok({ userId: signedIn.value.userId });
  };
}

/** Who is using the setup tool. Every setup page and action starts here. */
export function makeGetFounderContext(deps: AccessDeps) {
  return async (): Promise<Result<Founder, FounderAccessError>> => {
    const userId = await deps.auth.currentUserId();
    if (!userId) return err({ type: "NOT_SIGNED_IN" });
    if (!(await deps.admins.isAdmin(userId))) return err({ type: "NOT_A_FOUNDER" });
    return ok({ userId });
  };
}

/** A line of the founders' list: the restaurant and who owns it. */
export type ListedRestaurant = RestaurantSummary & { owners: Pick<RestaurantOwner, "userId" | "email">[] };

/** Every restaurant on the platform with its owners, newest first: for founders only. */
export function makeListRestaurants(deps: AccessDeps & { restaurants: RestaurantDirectory }) {
  return async (): Promise<Result<ListedRestaurant[], FounderAccessError>> => {
    const founder = await makeGetFounderContext(deps)();
    if (!founder.ok) return founder;
    const [restaurants, owners] = await Promise.all([deps.restaurants.list(), deps.restaurants.owners(founder.value.userId)]);
    return ok(
      restaurants.map((restaurant) => ({
        ...restaurant,
        owners: owners.filter((o) => o.restaurantId === restaurant.id).map(({ userId, email }) => ({ userId, email })),
      })),
    );
  };
}
