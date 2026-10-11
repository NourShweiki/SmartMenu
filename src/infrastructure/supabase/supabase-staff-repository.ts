import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserId } from "@/application/ports/auth-gateway";
import type { StaffAccountPolicy, StaffMember, StaffRepository } from "@/application/ports/staff-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { isRole, type Role } from "@/domain/restaurant/role";
import { REFUSED } from "./postgres-errors";

type StaffRow = { user_id: string; role: string; email: string; joined_at: string };

/** Rows of `list_restaurant_staff`; a role this app does not know (a newer database) is left out rather than guessed. */
export function toStaffMembers(rows: readonly StaffRow[]): StaffMember[] {
  return rows.flatMap((row) => (isRole(row.role) ? [{ userId: row.user_id as UserId, role: row.role, email: row.email, joinedAt: new Date(row.joined_at) }] : []));
}

/**
 * Use with the signed-in person's client: the staff list function answers only the owner and the manager, and the
 * writes go through the row policies and the membership guard, so the database decides each time.
 */
export class SupabaseStaffRepository implements StaffRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(restaurantId: RestaurantId): Promise<StaffMember[]> {
    const { data, error } = await this.db.rpc("list_restaurant_staff", { p_restaurant_id: restaurantId });
    if (error) {
      if (REFUSED.has(error.code)) return []; // not the owner or a manager here: nothing to see
      throw new Error(`list_restaurant_staff failed: ${error.message}`);
    }
    return toStaffMembers((data ?? []) as StaffRow[]);
  }

  async add(restaurantId: RestaurantId, userId: UserId, role: Role): Promise<boolean> {
    const { error } = await this.db.from("restaurant_members").insert({ restaurant_id: restaurantId, user_id: userId, role });
    if (!error) return true;
    // Refused by the row policy, or this person is already a member (unique restaurant + user).
    if (REFUSED.has(error.code) || error.code === "23505") return false;
    throw new Error(`adding the member failed: ${error.message}`);
  }

  async changeRole(restaurantId: RestaurantId, userId: UserId, role: Role): Promise<boolean> {
    const { data, error } = await this.db.from("restaurant_members").update({ role }).eq("restaurant_id", restaurantId).eq("user_id", userId).select("user_id");
    if (error) {
      if (REFUSED.has(error.code)) return false;
      throw new Error(`changing the member's role failed: ${error.message}`);
    }
    return (data ?? []).length === 1;
  }

  async remove(restaurantId: RestaurantId, userId: UserId): Promise<boolean> {
    const { data, error } = await this.db.from("restaurant_members").delete().eq("restaurant_id", restaurantId).eq("user_id", userId).select("user_id");
    if (error) {
      if (REFUSED.has(error.code)) return false;
      throw new Error(`removing the member failed: ${error.message}`);
    }
    return (data ?? []).length === 1;
  }
}

/**
 * Needs the SERVICE-ROLE client (the questions are about accounts, which no signed-in user can read). The database
 * functions check the acting person again: for anybody who is not an owner or manager of that restaurant the answer
 * is "no".
 */
export class SupabaseStaffAccountPolicy implements StaffAccountPolicy {
  constructor(private readonly service: SupabaseClient) {}

  async findUnattached(actorId: UserId, restaurantId: RestaurantId, email: string): Promise<UserId | null> {
    const { data, error } = await this.service.rpc("find_unattached_account", { p_actor_id: actorId, p_restaurant_id: restaurantId, p_email: email });
    if (error) {
      if (REFUSED.has(error.code)) return null;
      throw new Error(`find_unattached_account failed: ${error.message}`);
    }
    return typeof data === "string" ? (data as UserId) : null;
  }

  async isResettable(actorId: UserId, restaurantId: RestaurantId, userId: UserId): Promise<boolean> {
    const { data, error } = await this.service.rpc("is_resettable_staff_account", { p_actor_id: actorId, p_restaurant_id: restaurantId, p_user_id: userId });
    if (error) {
      if (REFUSED.has(error.code)) return false;
      throw new Error(`is_resettable_staff_account failed: ${error.message}`);
    }
    return data === true;
  }
}
