import type { SupabaseClient } from "@supabase/supabase-js";
import type { PasswordGateway, SetPasswordError } from "@/application/ports/password-gateway";
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * The signed-in user's own password. `db` is their session client. `newScratchClient` makes a client with NO stored
 * session: the current password is checked by signing in on it, so the check can never replace or end the session
 * the person is working in.
 */
export class SupabasePasswordGateway implements PasswordGateway {
  constructor(
    private readonly db: SupabaseClient,
    private readonly newScratchClient: () => SupabaseClient,
  ) {}

  async verify(email: string, password: string): Promise<boolean> {
    const scratch = this.newScratchClient();
    const { error } = await scratch.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.status === 400) return false; // wrong password
      throw new Error(`checking the password failed: ${error.message}`);
    }
    await scratch.auth.signOut({ scope: "local" }); // only the throw-away session this check just made
    return true;
  }

  async set(next: string): Promise<Result<void, SetPasswordError>> {
    const { error } = await this.db.auth.updateUser({ password: next });
    if (error) {
      if (error.code === "weak_password" || error.code === "same_password") return err({ type: "PASSWORD_REFUSED" });
      throw new Error(`changing the password failed: ${error.message}`);
    }
    return ok(undefined);
  }

  async refreshSession(): Promise<void> {
    const { error } = await this.db.auth.refreshSession();
    if (error) throw new Error(`renewing the session failed: ${error.message}`);
  }
}
