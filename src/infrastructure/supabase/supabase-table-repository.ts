import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableRepository } from "@/application/ports/table-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Table, TableId } from "@/domain/table-session/table-session";
import { UUID } from "./supabase-options-repository";

export type TableRow = {
  id: string;
  restaurant_id: string;
  label: string;
  token: string;
  is_active: boolean;
  created_at: string;
  deleted_at: string | null;
};

const COLUMNS = "id, restaurant_id, label, token, is_active, created_at, deleted_at";

export function toTable(row: TableRow): Table {
  return {
    id: row.id as TableId,
    restaurantId: row.restaurant_id as RestaurantId,
    label: row.label,
    token: row.token,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

/** Only the columns staff may UPDATE (see the tables migration's column grants): never id or restaurant_id. */
const editable = (t: Table) => ({
  label: t.label,
  token: t.token,
  is_active: t.isActive,
  deleted_at: t.deletedAt ? t.deletedAt.toISOString() : null,
});

/** Postgres "unique violation" on the label index (a second live table with the same label, ignoring case). */
const isLabelClash = (error: { code?: string; message?: string }) =>
  error.code === "23505" && (error.message ?? "").includes("restaurant_tables_label_key");

export class SupabaseTableRepository implements TableRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(restaurantId: RestaurantId): Promise<Table[]> {
    const { data, error } = await this.db
      .from("restaurant_tables")
      .select(COLUMNS)
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .order("label", { ascending: true }); // tables created together keep a natural order (1, 2, Terrace)
    if (error) throw new Error(`list tables failed: ${error.message}`);
    return ((data ?? []) as TableRow[]).map(toTable);
  }

  async find(restaurantId: RestaurantId, id: TableId): Promise<Table | null> {
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db.from("restaurant_tables").select(COLUMNS).eq("restaurant_id", restaurantId).eq("id", id).maybeSingle();
    if (error) throw new Error(`read table failed: ${error.message}`);
    return data ? toTable(data as TableRow) : null;
  }

  async insert(table: Table): Promise<"OK" | "LABEL_TAKEN"> {
    const { error } = await this.db.from("restaurant_tables").insert({
      id: table.id,
      restaurant_id: table.restaurantId,
      created_at: table.createdAt.toISOString(),
      ...editable(table),
    });
    if (!error) return "OK";
    if (isLabelClash(error)) return "LABEL_TAKEN";
    throw new Error(`add table failed: ${error.message}`);
  }

  async update(table: Table): Promise<"OK" | "LABEL_TAKEN" | "NOT_FOUND"> {
    if (!UUID.test(table.id)) return "NOT_FOUND";
    // RLS turns "not allowed" into zero matched rows rather than an error, so ask for the row back.
    const { data, error } = await this.db
      .from("restaurant_tables")
      .update(editable(table))
      .eq("restaurant_id", table.restaurantId)
      .eq("id", table.id)
      .select("id");
    if (error) {
      if (isLabelClash(error)) return "LABEL_TAKEN";
      throw new Error(`update table failed: ${error.message}`);
    }
    return (data?.length ?? 0) === 1 ? "OK" : "NOT_FOUND";
  }
}
