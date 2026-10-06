import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthGateway, SignInError, UserId } from "@/application/ports/auth-gateway";
import { err, ok, type Result } from "@/domain/shared/result";

export class SupabaseAuthGateway implements AuthGateway {
  constructor(private readonly db: SupabaseClient) {}

  async signInWithPassword(email: string, password: string): Promise<Result<{ userId: UserId }, SignInError>> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) {
      // 400 = wrong email/password (or unconfirmed). Anything else is an outage, not a user error.
      if (error.status === 400) return err({ type: "INVALID_CREDENTIALS" });
      throw new Error(`Supabase sign-in failed: ${error.message}`);
    }
    return ok({ userId: data.user.id as UserId });
  }

  async currentUserId(): Promise<UserId | null> {
    // getUser() asks Supabase Auth to verify the token; never trust the cookie contents alone.
    const { data } = await this.db.auth.getUser();
    return (data.user?.id as UserId | undefined) ?? null;
  }

  async signOut(): Promise<void> {
    // Only this browser. The default ('global') would also log out the same account on
    // every other device, e.g. the kitchen tablet.
    await this.db.auth.signOut({ scope: "local" });
  }
}
