import type { Branding } from "@/domain/restaurant/branding";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { LocalizedText } from "@/domain/shared/result";

/** What the owner edits on the branding screen: the restaurant's name and its branding. */
export type BrandingRecord = { name: LocalizedText; branding: Branding };

/**
 * Staff-side access to a restaurant's name + branding. Runs as the signed-in user, so the database (RLS)
 * decides again: members read, only the OWNER saves.
 */
export interface BrandingRepository {
  find(restaurantId: RestaurantId): Promise<BrandingRecord | null>;
  /** Saves name and branding together (all or nothing). False when nothing was saved (not allowed / not found). */
  save(restaurantId: RestaurantId, record: BrandingRecord): Promise<boolean>;
}
