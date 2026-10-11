import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionAtTable, TableSessionRepository } from "@/application/ports/table-session-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { SessionStatus, TableId, TableSessionId } from "@/domain/table-session/table-session";
import { REFUSED } from "./postgres-errors";
import { UUID } from "./supabase-options-repository";

/** A `table_sessions` row with its table's label (embedded through the foreign key to `restaurant_tables`). */
export type SessionAtTableRow = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  kind: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  restaurant_tables: { label: string } | null;
};

// The label comes with the session in ONE query. Deleted tables are included on purpose (no `deleted_at` filter):
// an order keeps saying which table it was for.
// A pickup visit has no table: the embedded table is then null (the embed is a LEFT join).
const COLUMNS = "id, restaurant_id, table_id, kind, customer_name, customer_phone, status, started_at, ended_at, restaurant_tables(label)";

/**
 * Null when the row is not a visit this app understands: a table visit whose table did not come with it (it always
 * should: the foreign key guarantees a table), or a pickup visit without its customer (the database check
 * guarantees one).
 */
export function toSessionAtTable(row: SessionAtTableRow): SessionAtTable | null {
  const pickup = row.kind === "PICKUP";
  if (pickup ? !row.customer_name || !row.customer_phone : !row.restaurant_tables || !row.table_id) return null;
  return {
    tableLabel: pickup ? null : row.restaurant_tables!.label,
    session: {
      id: row.id as TableSessionId,
      restaurantId: row.restaurant_id as RestaurantId,
      kind: pickup ? "PICKUP" : "TABLE",
      tableId: pickup ? null : (row.table_id as TableId),
      customer: pickup ? { name: row.customer_name!, phone: row.customer_phone! } : null,
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

  async listLive(restaurantId: RestaurantId): Promise<SessionAtTable[]> {
    const { data, error } = await this.db
      .from("table_sessions")
      .select(COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("kind", "TABLE") // pickup visits are not tables (they end with their last order)
      .neq("status", "CLOSED")
      .order("started_at", { ascending: true });
    if (error) throw new Error(`list live table sessions failed: ${error.message}`);
    return ((data ?? []) as unknown as SessionAtTableRow[]).flatMap((row) => toSessionAtTable(row) ?? []);
  }

  async updateStatus(restaurantId: RestaurantId, sessionId: TableSessionId, from: SessionStatus, to: SessionStatus): Promise<boolean> {
    if (!UUID.test(sessionId)) return false;
    // `.eq("status", from)` makes the move conditional: if someone else moved it first, zero rows match.
    // Only `status` is sent: it is the only column staff may change, and the trigger sets `ended_at`.
    const { data, error } = await this.db
      .from("table_sessions")
      .update({ status: to })
      .eq("restaurant_id", restaurantId)
      .eq("id", sessionId)
      .eq("status", from)
      .select("id");
    if (error) {
      if (REFUSED.has(error.code)) return false; // the database refused this user / this move
      throw new Error(`update table session failed: ${error.message}`);
    }
    return (data?.length ?? 0) === 1;
  }
}
