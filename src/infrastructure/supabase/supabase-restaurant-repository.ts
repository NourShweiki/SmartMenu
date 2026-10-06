import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicRestaurant, RestaurantRepository } from "@/application/ports/restaurant-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";

/** One row of public.get_public_restaurant(slug). */
export type PublicRestaurantRow = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  dine_in_enabled: boolean;
  takeout_enabled: boolean;
  delivery_enabled: boolean;
  tax_rate_bp: number;
  service_charge_bp: number;
  default_language: string;
};

export function toPublicRestaurant(row: PublicRestaurantRow): PublicRestaurant {
  return {
    id: row.id as RestaurantId,
    slug: row.slug,
    name: { en: row.name_en, ar: row.name_ar },
    settings: {
      dineInEnabled: row.dine_in_enabled,
      takeoutEnabled: row.takeout_enabled,
      deliveryEnabled: row.delivery_enabled,
      taxRateBp: row.tax_rate_bp,
      serviceChargeBp: row.service_charge_bp,
      // The DB check constraint only allows 'ar' | 'en'.
      defaultLanguage: row.default_language === "en" ? "en" : "ar",
    },
  };
}

export class SupabaseRestaurantRepository implements RestaurantRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findPublicBySlug(slug: string): Promise<PublicRestaurant | null> {
    const { data, error } = await this.db.rpc("get_public_restaurant", { p_slug: slug });
    if (error) throw new Error(`get_public_restaurant failed: ${error.message}`);
    const row = (data as PublicRestaurantRow[] | null)?.[0];
    return row ? toPublicRestaurant(row) : null;
  }
}
