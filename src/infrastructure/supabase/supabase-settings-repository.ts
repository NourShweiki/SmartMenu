import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettingsRepository } from "@/application/ports/settings-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { RestaurantSettings } from "@/domain/restaurant/settings";

/** One row of public.restaurant_settings (branding is left alone: it has its own screen later). */
export type SettingsRow = {
  dine_in_enabled: boolean;
  takeout_enabled: boolean;
  delivery_enabled: boolean;
  tax_rate_bp: number;
  service_charge_bp: number;
  default_language: string;
};

const COLUMNS = "dine_in_enabled, takeout_enabled, delivery_enabled, tax_rate_bp, service_charge_bp, default_language";

export function toSettings(row: SettingsRow): RestaurantSettings {
  return {
    dineInEnabled: row.dine_in_enabled,
    takeoutEnabled: row.takeout_enabled,
    deliveryEnabled: row.delivery_enabled,
    taxRateBp: row.tax_rate_bp,
    serviceChargeBp: row.service_charge_bp,
    // The DB check constraint only allows 'ar' | 'en'.
    defaultLanguage: row.default_language === "en" ? "en" : "ar",
  };
}

export function toSettingsRow(settings: RestaurantSettings): SettingsRow {
  return {
    dine_in_enabled: settings.dineInEnabled,
    takeout_enabled: settings.takeoutEnabled,
    delivery_enabled: settings.deliveryEnabled,
    tax_rate_bp: settings.taxRateBp,
    service_charge_bp: settings.serviceChargeBp,
    default_language: settings.defaultLanguage,
  };
}

export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SupabaseClient) {}

  async find(restaurantId: RestaurantId): Promise<RestaurantSettings | null> {
    const { data, error } = await this.db
      .from("restaurant_settings")
      .select(COLUMNS)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (error) throw new Error(`read settings failed: ${error.message}`);
    return data ? toSettings(data as SettingsRow) : null;
  }

  async update(restaurantId: RestaurantId, settings: RestaurantSettings): Promise<boolean> {
    // RLS turns "not allowed" into zero matched rows rather than an error, so ask for the row back.
    const { data, error } = await this.db
      .from("restaurant_settings")
      .update(toSettingsRow(settings))
      .eq("restaurant_id", restaurantId)
      .select("restaurant_id");
    if (error) throw new Error(`update settings failed: ${error.message}`);
    return (data?.length ?? 0) === 1;
  }
}
