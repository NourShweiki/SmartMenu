import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignInAttemptLog } from "@/application/ports/sign-in-attempt-log";

/**
 * Keys are stored as SHA-256 hashes: the table never holds an email or a network address. Web Crypto, not node:crypto:
 * the container is also loaded by the middleware, which runs where Node modules are not available.
 */
async function hash(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The failed sign-in log in `sign_in_failures` (migration 20261030120000). Use with the SERVICE-ROLE client: the
 * table and its functions are closed to everyone else, and a visitor who is signing in has no session yet.
 */
export class SupabaseSignInAttemptLog implements SignInAttemptLog {
  constructor(private readonly service: SupabaseClient) {}

  async countFailures(keys: readonly string[], since: Date): Promise<Record<string, number>> {
    const byHash = new Map(await Promise.all(keys.map(async (key) => [await hash(key), key] as const)));
    const { data, error } = await this.service.rpc("count_sign_in_failures", { p_keys: [...byHash.keys()], p_since: since.toISOString() });
    if (error) throw new Error(`count_sign_in_failures failed: ${error.message}`);
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { key_hash: string; failures: number }[]) {
      const key = byHash.get(row.key_hash);
      if (key) counts[key] = row.failures;
    }
    return counts;
  }

  async recordFailure(keys: readonly string[], at: Date): Promise<void> {
    const { error } = await this.service.rpc("record_sign_in_failure", { p_keys: await Promise.all(keys.map(hash)), p_at: at.toISOString() });
    if (error) throw new Error(`record_sign_in_failure failed: ${error.message}`);
  }

  async clearFailures(key: string): Promise<void> {
    const { error } = await this.service.rpc("clear_sign_in_failures", { p_key: await hash(key) });
    if (error) throw new Error(`clear_sign_in_failures failed: ${error.message}`);
  }
}
