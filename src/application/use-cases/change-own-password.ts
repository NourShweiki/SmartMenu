import type { AccountDirectory } from "@/application/ports/account-directory";
import type { AuthGateway } from "@/application/ports/auth-gateway";
import type { PasswordGateway, SetPasswordError } from "@/application/ports/password-gateway";
import { validateNewPassword, type PasswordError } from "@/domain/shared/password";
import { err, ok, type Result } from "@/domain/shared/result";

export type ChangeOwnPasswordError = { type: "NOT_SIGNED_IN" } | { type: "WRONG_PASSWORD" } | SetPasswordError | PasswordError;

/**
 * Somebody who is signed in replaces their own password. They must give the current one: a session left open on a
 * shared tablet is not enough to take the account over. If the current one was a temporary password (handed out
 * when the account was made), it stops being marked as one, and the session learns that at once.
 */
export function makeChangeOwnPassword(deps: {
  auth: Pick<AuthGateway, "currentUser">;
  passwords: PasswordGateway;
  accounts: Pick<AccountDirectory, "clearTemporaryPassword">;
}) {
  return async (input: { current: string; next: string }): Promise<Result<void, ChangeOwnPasswordError>> => {
    const user = await deps.auth.currentUser();
    if (!user) return err({ type: "NOT_SIGNED_IN" });

    const valid = validateNewPassword(input.next, input.current);
    if (!valid.ok) return valid;
    if (!(await deps.passwords.verify(user.email, input.current))) return err({ type: "WRONG_PASSWORD" });

    const changed = await deps.passwords.set(valid.value);
    if (!changed.ok) return changed;

    // After the password, never before: if this step fails the person is merely asked to change it once more.
    if (user.mustChangePassword) await deps.accounts.clearTemporaryPassword(user.userId);
    await deps.passwords.refreshSession();
    return ok(undefined);
  };
}
