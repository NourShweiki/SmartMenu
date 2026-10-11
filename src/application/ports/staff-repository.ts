import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import type { UserId } from "./auth-gateway";

/** Somebody who works at a restaurant, as the owner's staff screen shows them. */
export type StaffMember = { userId: UserId; role: Role; email: string; joinedAt: Date };

/**
 * A restaurant's staff, read and changed AS THE SIGNED-IN PERSON: the database decides again who may do what (the
 * row policies, and the guard that stops anybody from acting on themselves or removing the last owner). Each write
 * answers `false` when it did not happen, whatever the reason.
 */
export interface StaffRepository {
  /** Owners first, then managers, waiters, cashiers; within a role in the order they joined. */
  list(restaurantId: RestaurantId): Promise<StaffMember[]>;
  add(restaurantId: RestaurantId, userId: UserId, role: Role): Promise<boolean>;
  changeRole(restaurantId: RestaurantId, userId: UserId, role: Role): Promise<boolean>;
  remove(restaurantId: RestaurantId, userId: UserId): Promise<boolean>;
}

/**
 * What the server may do to ACCOUNTS on behalf of one restaurant's owner or manager. Accounts are made and given
 * passwords with a key that could touch any account on the platform; these two questions are asked first, and the
 * store checks the acting person again before it answers.
 */
export interface StaffAccountPolicy {
  /**
   * The existing account behind this email, if it may be taken on as new staff: it belongs to no restaurant and is
   * not a founder's. `null` otherwise (no such account, or one that must not be touched).
   */
  findUnattached(actorId: UserId, restaurantId: RestaurantId, email: string): Promise<UserId | null>;
  /** Whether this person's password may be replaced from this restaurant: a non-owner member who works nowhere else. */
  isResettable(actorId: UserId, restaurantId: RestaurantId, userId: UserId): Promise<boolean>;
}
