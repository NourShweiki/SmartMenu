import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserId } from "@/application/ports/auth-gateway";
import type { RestaurantClash, RestaurantDirectory, RestaurantSummary, StoreRestaurantError } from "@/application/ports/restaurant-directory";
import type { Restaurant, RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";

/** The payload of the `create_restaurant` database function (every field required). */
export function toCreateRestaurantPayload(restaurant: Restaurant) {
  const s = restaurant.settings;
  return {
    id: restaurant.id,
    slug: restaurant.slug,
    name_en: restaurant.name.en,
    name_ar: restaurant.name.ar,
    settings: {
      dine_in_enabled: s.dineInEnabled,
      takeout_enabled: s.takeoutEnabled,
      delivery_enabled: s.deliveryEnabled,
      tax_rate_bp: s.taxRateBp,
      service_charge_bp: s.serviceChargeBp,
      default_language: s.defaultLanguage,
    },
  };
}

/**
 * All restaurants of the platform, for the founders' setup tool. Needs the SERVICE-ROLE client (it works across
 * tenants, which no signed-in user may): server only, behind a founder check. `create_restaurant` checks the
 * founder once more inside the database.
 */
export class SupabaseRestaurantDirectory implements RestaurantDirectory {
  constructor(private readonly service: SupabaseClient) {}

  async list(): Promise<RestaurantSummary[]> {
    const { data, error } = await this.service
      .from("restaurants")
      .select("id, slug, name_en, name_ar, created_at")
      .order("created_at", { ascending: false })
      .order("slug")
      .returns<{ id: string; slug: string; name_en: string; name_ar: string; created_at: string }[]>();
    if (error) throw new Error(`restaurants list failed: ${error.message}`);
    return data.map((row) => ({
      id: row.id as RestaurantId,
      slug: row.slug,
      name: { en: row.name_en, ar: row.name_ar },
      createdAt: new Date(row.created_at),
    }));
  }

  async clash(id: RestaurantId, slug: string): Promise<RestaurantClash | null> {
    const [sameId, sameSlug] = await Promise.all([
      this.service.from("restaurants").select("id").eq("id", id).maybeSingle(),
      this.service.from("restaurants").select("id").eq("slug", slug).maybeSingle(),
    ]);
    const error = sameId.error ?? sameSlug.error;
    if (error) throw new Error(`restaurants lookup failed: ${error.message}`);
    if (sameId.data) return "SAME_ID";
    return sameSlug.data ? "SLUG" : null;
  }

  async create(actorId: UserId, restaurant: Restaurant, ownerId: UserId): Promise<Result<void, StoreRestaurantError>> {
    const { error } = await this.service.rpc("create_restaurant", {
      p_actor_id: actorId,
      p_restaurant: toCreateRestaurantPayload(restaurant),
      p_owner_id: ownerId,
    });
    if (!error) return ok(undefined);
    if (error.code === "42501") return err({ type: "NOT_A_FOUNDER" });
    // Both are "duplicate key" (23505); the constraint's name says which one it was.
    if (error.code === "23505" && error.message.includes("restaurants_pkey")) return err({ type: "ALREADY_CREATED" });
    if (error.code === "23505" && error.message.includes("restaurants_slug_key")) return err({ type: "SLUG_TAKEN" });
    throw new Error(`create_restaurant failed: ${error.message}`);
  }
}
