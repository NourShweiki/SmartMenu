import type { Result } from "@/domain/shared/result";

export type SetPasswordError = { type: "PASSWORD_REFUSED" };

/** The signed-in person's own password. (Passwords set FOR somebody else go through AccountDirectory.) */
export interface PasswordGateway {
  /** Whether this is the account's password. Must not sign anybody in or out in the current session. */
  verify(email: string, password: string): Promise<boolean>;
  /** Replaces the signed-in user's password. PASSWORD_REFUSED: the sign-in service's own rules said no. */
  set(next: string): Promise<Result<void, SetPasswordError>>;
  /** Renews the session, so what it says about the user (a temporary password, for one) is up to date at once. */
  refreshSession(): Promise<void>;
}
