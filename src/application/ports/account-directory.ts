import type { Result } from "@/domain/shared/result";
import type { UserId } from "./auth-gateway";

/** INVALID_EMAIL: the sign-in service is stricter about addresses than a quick format check and refused this one. */
export type CreateAccountError = { type: "EMAIL_TAKEN" } | { type: "INVALID_EMAIL" };

/** Sign-in accounts for staff, made on their behalf (staff never sign themselves up). */
export interface AccountDirectory {
  /**
   * A new account that can sign in at once with this password, which is marked as TEMPORARY: its owner must choose
   * their own (CurrentUser.mustChangePassword). The email is already trimmed and lower-case.
   */
  create(email: string, password: string): Promise<Result<{ userId: UserId }, CreateAccountError>>;
  /**
   * Replaces an account's password with a TEMPORARY one (marked like a new account's). The old password stops
   * working and the account's other sessions can no longer be renewed.
   */
  setTemporaryPassword(userId: UserId, password: string): Promise<void>;
  /** The account's owner has chosen their own password: it is no longer a temporary one. */
  clearTemporaryPassword(userId: UserId): Promise<void>;
  /** Undoes `create` when what the account was made for did not happen. */
  remove(userId: UserId): Promise<void>;
}
