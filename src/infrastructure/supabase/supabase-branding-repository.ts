import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandingRecord, BrandingRepository } from "@/application/ports/branding-repository";
import { brandingFromJson, brandingToJson } from "@/domain/restaurant/branding";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { UUID } from "./supabase-options-repository";

/** One row of restaurants + its settings (the settings table is 1:1, so PostgREST may return an object or a 1-item list). */
export type BrandingRow = {
  name_en: string;
  name_ar: string;
  restaurant_settings: { branding: unknown } | { branding: unknown }[] | null;
};

export function toBrandingRecord(row: BrandingRow): BrandingRecord {
  const settings = Array.isArray(row.restaurant_settings) ? row.restaurant_settings[0] : row.restaurant_settings;
  return { name: { en: row.name_en, ar: row.name_ar }, branding: brandingFromJson(settings?.branding) };
}

export class SupabaseBrandingRepository implements BrandingRepository {
  constructor(private readonly db: SupabaseClient) {}

  async find(restaurantId: RestaurantId): Promise<BrandingRecord | null> {
    if (!UUID.test(restaurantId)) return null;
    const { data, error } = await this.db
      .from("restaurants")
      .select("name_en, name_ar, restaurant_settings(branding)")
      .eq("id", restaurantId)
      .maybeSingle();
    if (error) throw new Error(`read branding failed: ${error.message}`);
    return data ? toBrandingRecord(data as unknown as BrandingRow) : null;
  }

  async save(restaurantId: RestaurantId, record: BrandingRecord): Promise<boolean> {
    // One database function = one transaction: the name and the branding are saved together or not at all.
    const { data, error } = await this.db.rpc("update_restaurant_branding", {
      p_restaurant_id: restaurantId,
      p_name_en: record.name.en,
      p_name_ar: record.name.ar,
      p_branding: brandingToJson(record.branding),
    });
    if (error) {
      if (error.code === "42501") return false; // the database refused this user
      throw new Error(`save branding failed: ${error.message}`);
    }
    return data === true;
  }
}
