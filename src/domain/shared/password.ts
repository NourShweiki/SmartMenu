import { err, ok, type Result } from "./result";

/** The same minimum the sign-in service enforces (supabase/config.toml: minimum_password_length). */
export const PASSWORD_MIN_LENGTH = 10;
/** Passwords are stored with bcrypt, which only looks at the first 72 BYTES: anything longer would be silently cut. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordError = { type: "PASSWORD_TOO_SHORT" } | { type: "PASSWORD_TOO_LONG" } | { type: "PASSWORD_UNCHANGED" };

/**
 * A password somebody chooses for themselves, replacing `current`. Length only, on purpose: a long phrase beats
 * forced symbols. Characters are counted as people see them (an Arabic letter is one), the upper limit in bytes.
 * The password is taken exactly as typed: spaces count, nothing is trimmed.
 */
export function validateNewPassword(next: string, current: string): Result<string, PasswordError> {
  if ([...next].length < PASSWORD_MIN_LENGTH || next.trim().length === 0) return err({ type: "PASSWORD_TOO_SHORT" });
  if (new TextEncoder().encode(next).length > PASSWORD_MAX_BYTES) return err({ type: "PASSWORD_TOO_LONG" });
  if (next === current) return err({ type: "PASSWORD_UNCHANGED" });
  return ok(next);
}
