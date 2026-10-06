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
    // getClaims() verifies the token's signature and expiry locally (asymmetric signing keys,
    // JWKS cached across requests) — never trust the cookie contents without this. Tradeoff vs
    // getUser(): a session ended elsewhere stays valid until the token expires (max 1 hour).
    const { data, error } = await this.db.auth.getClaims();
    if (error || !data?.claims.sub) return null;
    return data.claims.sub as UserId;
  }

  async signOut(): Promise<void> {
    // Only this browser. The default ('global') would also log out the same account on
    // every other device, e.g. the kitchen tablet.
    await this.db.auth.signOut({ scope: "local" });
  }
}
