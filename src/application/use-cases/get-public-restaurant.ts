import { validateSlug } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import type { PublicRestaurant, RestaurantRepository } from "@/application/ports/restaurant-repository";

export type GetPublicRestaurantInput = { slug: string };
export type GetPublicRestaurantError = { type: "RESTAURANT_NOT_FOUND" };

/**
 * Resolves which restaurant a customer is visiting. This is where the tenant comes
 * from, so unlike other use cases it takes a slug instead of a restaurantId.
 */
export function makeGetPublicRestaurant(deps: { restaurants: RestaurantRepository }) {
  return async (input: GetPublicRestaurantInput): Promise<Result<PublicRestaurant, GetPublicRestaurantError>> => {
    const slug = input.slug.trim().toLowerCase();
    // A malformed slug can never match, so skip the database round trip.
    if (!validateSlug(slug).ok) return err({ type: "RESTAURANT_NOT_FOUND" });

    const restaurant = await deps.restaurants.findPublicBySlug(slug);
    return restaurant ? ok(restaurant) : err({ type: "RESTAURANT_NOT_FOUND" });
  };
}
