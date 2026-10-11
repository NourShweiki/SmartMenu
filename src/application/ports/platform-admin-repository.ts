import type { UserId } from "./auth-gateway";

/** The founders (platform admins): the people who may use the setup tool. Not a restaurant role. */
export interface PlatformAdminRepository {
  isAdmin(userId: UserId): Promise<boolean>;
}
