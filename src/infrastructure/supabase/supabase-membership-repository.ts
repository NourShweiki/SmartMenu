import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserId } from "@/application/ports/auth-gateway";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { ROLES, type Role } from "@/domain/restaurant/role";

/** Use with the signed-in user's client: RLS lets members read their own restaurant's rows. */
export class SupabaseMembershipRepository implements MembershipRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findRole(restaurantId: RestaurantId, userId: UserId): Promise<Role | null> {
    const { data, error } = await this.db
      .from("restaurant_members")
      .select("role")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", userId)
      .maybeSingle<{ role: string }>();
    if (error) throw new Error(`restaurant_members lookup failed: ${error.message}`);
    const role = data?.role;
    return role && (ROLES as readonly string[]).includes(role) ? (role as Role) : null;
  }
}
