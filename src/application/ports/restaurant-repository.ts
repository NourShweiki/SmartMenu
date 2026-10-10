import type { Branding } from "@/domain/restaurant/branding";
import type { Restaurant } from "@/domain/restaurant/restaurant";

/** What anyone on the internet may know about a restaurant (mirrors get_public_restaurant in SQL). */
export type PublicRestaurant = Pick<Restaurant, "id" | "slug" | "name" | "settings"> & {
  /** Logo path, accent colour and written details: all of it is public by design. */
  branding: Branding;
};

export interface RestaurantRepository {
  /**
   * Resolves the tenant from its public slug, so it is the one lookup that cannot take a
   * restaurantId. Returns null when no restaurant has this slug.
   */
  findPublicBySlug(slug: string): Promise<PublicRestaurant | null>;
}
