import type { AccountDirectory, CreateAccountError } from "@/application/ports/account-directory";
import type { AuthGateway } from "@/application/ports/auth-gateway";
import type { PlatformAdminRepository } from "@/application/ports/platform-admin-repository";
import type { RestaurantDirectory } from "@/application/ports/restaurant-directory";
import type { Clock, PasswordGenerator } from "@/application/ports/system";
import { createRestaurant, type Restaurant, type RestaurantError } from "@/domain/restaurant/restaurant";
import type { BusinessType } from "@/domain/restaurant/settings";
import { err, ok, type LocalizedText, type Result } from "@/domain/shared/result";
import { isUuid } from "@/domain/shared/uuid";

export type CreateRestaurantRequest = {
  /**
   * The form's own id for this submission. It becomes the restaurant's id, so a form that is sent twice (a lost
   * reply, a second press) cannot create two restaurants: the second time the answer is ALREADY_CREATED.
   */
  id: string;
  slug: string;
  name: LocalizedText;
  businessType: BusinessType;
  ownerEmail: string;
};

export type CreatedRestaurant = {
  restaurant: Restaurant;
  ownerEmail: string;
  /** Shown to the founder ONCE, to pass on to the owner. It is stored nowhere readable and cannot be shown again. */
  temporaryPassword: string;
};

export type CreateRestaurantError =
  | { type: "NOT_SIGNED_IN" }
  | { type: "NOT_A_FOUNDER" }
  | { type: "INVALID_ID" }
  | { type: "ALREADY_CREATED" }
  | { type: "SLUG_TAKEN" }
  | CreateAccountError
  | RestaurantError;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A founder sets up a new client: the restaurant with the settings of its business type (preset), and its first
 * owner, who gets a sign-in account with a temporary password.
 *
 * The account is made first because the restaurant needs its owner; if the restaurant then cannot be stored, the
 * account is removed again, so a failed attempt leaves nothing behind and can simply be repeated.
 */
export function makeCreateRestaurant(deps: {
  auth: AuthGateway;
  admins: PlatformAdminRepository;
  accounts: AccountDirectory;
  restaurants: RestaurantDirectory;
  passwords: PasswordGenerator;
  clock: Clock;
}) {
  return async (input: CreateRestaurantRequest): Promise<Result<CreatedRestaurant, CreateRestaurantError>> => {
    const actorId = await deps.auth.currentUserId();
    if (!actorId) return err({ type: "NOT_SIGNED_IN" });
    if (!(await deps.admins.isAdmin(actorId))) return err({ type: "NOT_A_FOUNDER" });

    if (!isUuid(input.id)) return err({ type: "INVALID_ID" });
    const ownerEmail = input.ownerEmail.trim().toLowerCase();
    if (ownerEmail.length > 254 || !EMAIL.test(ownerEmail)) return err({ type: "INVALID_EMAIL" });

    const draft = createRestaurant(
      { slug: input.slug, name: input.name, businessType: input.businessType },
      { newId: () => input.id.toLowerCase(), now: () => deps.clock.now() },
    );
    if (!draft.ok) return draft;
    const restaurant = draft.value;

    // Asked before the account is made, so the usual refusals cost nothing. Two founders racing for one address
    // are still caught by the store itself, below.
    const clash = await deps.restaurants.clash(restaurant.id, restaurant.slug);
    if (clash === "SAME_ID") return err({ type: "ALREADY_CREATED" });
    if (clash === "SLUG") return err({ type: "SLUG_TAKEN" });

    const temporaryPassword = deps.passwords.newPassword();
    const account = await deps.accounts.create(ownerEmail, temporaryPassword);
    if (!account.ok) return account;
    const ownerId = account.value.userId;

    let stored: Awaited<ReturnType<RestaurantDirectory["create"]>>;
    try {
      stored = await deps.restaurants.create(actorId, restaurant, ownerId);
    } catch (error) {
      await deps.accounts.remove(ownerId).catch(() => {}); // the first failure is the one worth reporting
      throw error;
    }
    if (!stored.ok) {
      await deps.accounts.remove(ownerId);
      return stored;
    }
    return ok({ restaurant, ownerEmail, temporaryPassword });
  };
}
