import type { Restaurant, RestaurantId } from "@/domain/restaurant/restaurant";
import type { Result } from "@/domain/shared/result";
import type { UserId } from "./auth-gateway";

/** Why a new restaurant cannot be stored: this very one is already there (same id), or its address belongs to another. */
export type RestaurantClash = "SAME_ID" | "SLUG";

export type StoreRestaurantError = { type: "ALREADY_CREATED" } | { type: "SLUG_TAKEN" } | { type: "NOT_A_FOUNDER" };

/** One line of the founders' list of restaurants. */
export type RestaurantSummary = Pick<Restaurant, "id" | "slug" | "name" | "createdAt">;

/** An OWNER of a restaurant, with the email they sign in with. */
export type RestaurantOwner = { restaurantId: RestaurantId; userId: UserId; email: string };

/**
 * The platform's list of restaurants, as the founders' setup tool sees it. The one port that works ACROSS tenants,
 * which is why its methods take no restaurantId: use it only behind a founder check.
 */
export interface RestaurantDirectory {
  /** Every restaurant, newest first. */
  list(): Promise<RestaurantSummary[]>;
  /** The owners of one restaurant, or of all of them, in the order they joined. The store checks the founder again. */
  owners(actorId: UserId, restaurantId?: RestaurantId): Promise<RestaurantOwner[]>;
  clash(id: RestaurantId, slug: string): Promise<RestaurantClash | null>;
  /** Stores the restaurant, its settings and its first OWNER together, or nothing. The store checks the founder again. */
  create(actorId: UserId, restaurant: Restaurant, ownerId: UserId): Promise<Result<void, StoreRestaurantError>>;
}
