import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionAtTable, TableSessionRepository } from "@/application/ports/table-session-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { SessionStatus, TableId, TableSessionId } from "@/domain/table-session/table-session";
import { UUID } from "./supabase-options-repository";

/** A `table_sessions` row with its table's label (embedded through the foreign key to `restaurant_tables`). */
export type SessionAtTableRow = {
  id: string;
  restaurant_id: string;
  table_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  restaurant_tables: { label: string } | null;
};

// The label comes with the session in ONE query. Deleted tables are included on purpose (no `deleted_at` filter):
// an order keeps saying which table it was for.
const COLUMNS = "id, restaurant_id, table_id, status, started_at, ended_at, restaurant_tables(label)";

/** Null when the table did not come with the session (it always should: the foreign key guarantees a table). */
export function toSessionAtTable(row: SessionAtTableRow): SessionAtTable | null {
  if (!row.restaurant_tables) return null;
  return {
    tableLabel: row.restaurant_tables.label,
    session: {
      id: row.id as TableSessionId,
      restaurantId: row.restaurant_id as RestaurantId,
      tableId: row.table_id as TableId,
      status: row.status as SessionStatus,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : null,
    },
  };
}

/**
 * Staff side of table sessions. `db` is the signed-in staff member's client, so RLS applies: members of the
 * restaurant read its sessions and tables, nobody else does.
 */
export class SupabaseTableSessionRepository implements TableSessionRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findWithTables(restaurantId: RestaurantId, sessionIds: readonly TableSessionId[]): Promise<SessionAtTable[]> {
    const ids = [...new Set(sessionIds)].filter((id) => UUID.test(id)); // anything else cannot be a session
    if (ids.length === 0) return [];
    const { data, error } = await this.db.from("table_sessions").select(COLUMNS).eq("restaurant_id", restaurantId).in("id", ids);
    if (error) throw new Error(`read table sessions failed: ${error.message}`);
    return ((data ?? []) as unknown as SessionAtTableRow[]).flatMap((row) => toSessionAtTable(row) ?? []);
  }
}
