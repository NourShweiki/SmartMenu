import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { RestaurantSettings } from "@/domain/restaurant/settings";

/**
 * Staff-side access to a restaurant's settings. Runs as the signed-in user, so the database
 * (RLS) decides again who may read or change them: members read, only the OWNER updates.
 */
export interface SettingsRepository {
  find(restaurantId: RestaurantId): Promise<RestaurantSettings | null>;
  /** False when nothing was changed (the row is missing, or the database refused the user). */
  update(restaurantId: RestaurantId, settings: RestaurantSettings): Promise<boolean>;
}
