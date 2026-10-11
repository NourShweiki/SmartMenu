/**
 * Key in an account's `app_metadata` (only the server can write it; it travels inside the signed session token):
 * `true` while the account still has the temporary password it was handed. Written by SupabaseAccountDirectory,
 * read from the session by SupabaseAuthGateway.
 */
export const TEMPORARY_PASSWORD_FLAG = "must_change_password";
