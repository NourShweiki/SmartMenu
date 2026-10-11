import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountDirectory, CreateAccountError } from "@/application/ports/account-directory";
import type { UserId } from "@/application/ports/auth-gateway";
import { err, ok, type Result } from "@/domain/shared/result";

/** Staff accounts through the auth admin API. Needs the SERVICE-ROLE client: server only, behind a permission check. */
export class SupabaseAccountDirectory implements AccountDirectory {
  constructor(private readonly service: SupabaseClient) {}

  async create(email: string, password: string): Promise<Result<{ userId: UserId }, CreateAccountError>> {
    // email_confirm: the account can sign in at once (there is no confirmation email; public sign-up is off).
    const { data, error } = await this.service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      if (error.code === "email_exists") return err({ type: "EMAIL_TAKEN" });
      // The password is ours and always acceptable, so a validation failure is about the address.
      if (error.code === "validation_failed") return err({ type: "INVALID_EMAIL" });
      throw new Error(`creating the account failed: ${error.message}`);
    }
    return ok({ userId: data.user.id as UserId });
  }

  async remove(userId: UserId): Promise<void> {
    const { error } = await this.service.auth.admin.deleteUser(userId);
    if (error) throw new Error(`removing the account failed: ${error.message}`);
  }
}
