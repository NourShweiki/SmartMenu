import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { TableSession, TableSessionId } from "@/domain/table-session/table-session";

/** A visit together with the label of its table: what staff need next to an order ("Table 7"). */
export type SessionAtTable = { readonly session: TableSession; readonly tableLabel: string };

/**
 * The STAFF side of table sessions: runs as the signed-in staff member, so the database decides again who may
 * read (every member of the restaurant). Customers never use this; they go through `TableSessionGateway`.
 * Every method takes the restaurantId first (tenant scope, data-model skill §1).
 */
export interface TableSessionRepository {
  /**
   * The sessions with these ids that belong to this restaurant, each with its table's label. The label is the
   * table's CURRENT one, and it is still there for a table that was deleted since (an order keeps saying where
   * it was served). Ids that are unknown, or another restaurant's, are simply missing from the result.
   */
  findWithTables(restaurantId: RestaurantId, sessionIds: readonly TableSessionId[]): Promise<SessionAtTable[]>;
}
