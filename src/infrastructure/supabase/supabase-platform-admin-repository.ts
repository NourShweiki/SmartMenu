import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserId } from "@/application/ports/auth-gateway";
import type { PlatformAdminRepository } from "@/application/ports/platform-admin-repository";

/** Use with the signed-in user's client: RLS shows a user their own row in `platform_admins` and no other. */
export class SupabasePlatformAdminRepository implements PlatformAdminRepository {
  constructor(private readonly db: SupabaseClient) {}

  async isAdmin(userId: UserId): Promise<boolean> {
    const { data, error } = await this.db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`platform_admins lookup failed: ${error.message}`);
    return data !== null;
  }
}
