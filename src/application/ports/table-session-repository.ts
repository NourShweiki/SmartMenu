import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { SessionStatus, TableSession, TableSessionId } from "@/domain/table-session/table-session";

/**
 * A visit together with the label of its table: what staff need next to an order ("Table 7"). A PICKUP visit has no
 * table: its label is null, and `session.customer` says who it is for.
 */
export type SessionAtTable = { readonly session: TableSession; readonly tableLabel: string | null };

/**
 * The STAFF side of table sessions: runs as the signed-in staff member, so the database decides again who may
 * read (every member of the restaurant). Customers never use this; they go through `TableSessionGateway`.
 * Every method takes the restaurantId first (tenant scope, data-model skill §1).
 */
export interface TableSessionRepository {
  /**
   * The sessions with these ids that belong to this restaurant, table visits and pickup visits alike, each with its
   * table's label (null for a pickup visit). The label is the
   * table's CURRENT one, and it is still there for a table that was deleted since (an order keeps saying where
   * it was served). Ids that are unknown, or another restaurant's, are simply missing from the result.
   */
  findWithTables(restaurantId: RestaurantId, sessionIds: readonly TableSessionId[]): Promise<SessionAtTable[]>;
  /**
   * Every TABLE visit of this restaurant that is not stored as CLOSED, oldest first, with its table's label (pickup
   * visits are not tables: they end by themselves and never appear here). That
   * includes visits that ran out of time and were never closed: they stay "live" in storage until staff close them.
   */
  listLive(restaurantId: RestaurantId): Promise<SessionAtTable[]>;
  /**
   * Moves a session only if it is still in `from`. False when someone else moved it first, it does not exist
   * here, or the database refused this user or this move (never report a change that did not happen). The end
   * time of a CLOSED session is set by the database.
   */
  updateStatus(restaurantId: RestaurantId, sessionId: TableSessionId, from: SessionStatus, to: SessionStatus): Promise<boolean>;
}
