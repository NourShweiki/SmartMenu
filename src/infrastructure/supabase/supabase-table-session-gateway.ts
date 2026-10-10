import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicSession, TableSessionGateway } from "@/application/ports/table-session-gateway";
import { SESSION_STATUSES, type SessionStatus, type TableSessionId } from "@/domain/table-session/table-session";

/**
 * What public.join_table_session / get_public_session return (jsonb). Read defensively: anything that is not the
 * expected shape means "no session", never an error on the public page.
 */
export function toPublicSession(json: unknown): PublicSession | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const status = SESSION_STATUSES.find((s) => s === o.status) as SessionStatus | undefined;
  if (typeof o.session_id !== "string" || o.session_id === "" || typeof o.table_label !== "string" || !status) return null;
  return { sessionId: o.session_id as TableSessionId, tableLabel: o.table_label, status };
}

/** Customers have no accounts: both calls use the public (anon) client and the two narrow public functions. */
export class SupabaseTableSessionGateway implements TableSessionGateway {
  constructor(private readonly db: SupabaseClient) {}

  async join(slug: string, token: string): Promise<PublicSession | null> {
    const { data, error } = await this.db.rpc("join_table_session", { p_slug: slug, p_token: token });
    if (error) throw new Error(`join_table_session failed: ${error.message}`);
    return toPublicSession(data);
  }

  async find(slug: string, sessionId: string): Promise<PublicSession | null> {
    const { data, error } = await this.db.rpc("get_public_session", { p_slug: slug, p_session_id: sessionId });
    if (error) throw new Error(`get_public_session failed: ${error.message}`);
    return toPublicSession(data);
  }
}
