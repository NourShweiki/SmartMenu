import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import type { UserId } from "./auth-gateway";

export interface MembershipRepository {
  /** The user's role in this restaurant, or null when they are not staff there. */
  findRole(restaurantId: RestaurantId, userId: UserId): Promise<Role | null>;
}
