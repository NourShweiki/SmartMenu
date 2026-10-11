import type { AccountDirectory } from "@/application/ports/account-directory";
import type { AuthGateway, UserId } from "@/application/ports/auth-gateway";
import type { PlatformAdminRepository } from "@/application/ports/platform-admin-repository";
import type { RestaurantDirectory } from "@/application/ports/restaurant-directory";
import type { PasswordGenerator } from "@/application/ports/system";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import { isUuid } from "@/domain/shared/uuid";
import type { FounderAccessError } from "./founder-access";

export type IssuedPassword = {
  ownerEmail: string;
  /** Shown to the founder ONCE, to pass on to the owner. It cannot be shown again; issuing another one replaces it. */
  temporaryPassword: string;
};

export type IssueTemporaryPasswordError = FounderAccessError | { type: "NOT_AN_OWNER" };

/**
 * A founder gives a restaurant's owner a new temporary password: the first one was never passed on, or the owner
 * forgot theirs. The owner's old password stops working at once, their other sessions end, and the new password is
 * temporary: it opens nothing but "choose your own password".
 *
 * Only an account that IS an owner of that restaurant can be reset this way, never just any account (a founder's,
 * for one), whatever ids the request carries.
 */
export function makeIssueTemporaryPassword(deps: {
  auth: AuthGateway;
  admins: PlatformAdminRepository;
  restaurants: RestaurantDirectory;
  accounts: Pick<AccountDirectory, "setTemporaryPassword">;
  passwords: PasswordGenerator;
}) {
  return async (input: { restaurantId: string; ownerId: string }): Promise<Result<IssuedPassword, IssueTemporaryPasswordError>> => {
    const actorId = await deps.auth.currentUserId();
    if (!actorId) return err({ type: "NOT_SIGNED_IN" });
    if (!(await deps.admins.isAdmin(actorId))) return err({ type: "NOT_A_FOUNDER" });

    if (!isUuid(input.restaurantId) || !isUuid(input.ownerId)) return err({ type: "NOT_AN_OWNER" });
    const owners = await deps.restaurants.owners(actorId, input.restaurantId as RestaurantId);
    const owner = owners.find((o) => o.userId === (input.ownerId.toLowerCase() as UserId));
    if (!owner) return err({ type: "NOT_AN_OWNER" });

    const temporaryPassword = deps.passwords.newPassword();
    await deps.accounts.setTemporaryPassword(owner.userId, temporaryPassword);
    return ok({ ownerEmail: owner.email, temporaryPassword });
  };
}
