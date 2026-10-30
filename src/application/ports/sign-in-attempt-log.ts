/**
 * Failed sign-ins, kept where every server instance sees the same counts (the database), so the limit holds however
 * many servers run and survives a restart. Keys come from `signInKeys` (domain); the adapter stores them hashed.
 */
export interface SignInAttemptLog {
  /** How many failures each key has had after `since` (strictly). A key with none may be left out. */
  countFailures(keys: readonly string[], since: Date): Promise<Record<string, number>>;
  /** One failed attempt, counted under every key. */
  recordFailure(keys: readonly string[], at: Date): Promise<void>;
  /** Forget a key's failures (the account's, after a successful sign-in). */
  clearFailures(key: string): Promise<void>;
}
