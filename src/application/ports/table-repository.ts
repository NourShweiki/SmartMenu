import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Table, TableId } from "@/domain/table-session/table-session";

/**
 * Staff-side storage for tables. Runs as the signed-in user, so the database (RLS) decides again:
 * members read, only OWNER and MANAGER change tables.
 */
export interface TableRepository {
  /** Live (not deleted) tables, in the order they were created. */
  list(restaurantId: RestaurantId): Promise<Table[]>;
  find(restaurantId: RestaurantId, id: TableId): Promise<Table | null>;
  /** "LABEL_TAKEN": another live table of this restaurant already has this label (ignoring case and spacing). */
  insert(table: Table): Promise<"OK" | "LABEL_TAKEN">;
  /** "NOT_FOUND": nothing was changed (the table is gone, or the database refused this user). */
  update(table: Table): Promise<"OK" | "LABEL_TAKEN" | "NOT_FOUND">;
}
