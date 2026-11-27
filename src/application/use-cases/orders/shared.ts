import type { TableSessionRepository } from "@/application/ports/table-session-repository";
import type { OrderError, TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { SessionKind } from "@/domain/table-session/pickup";
import type { ForbiddenError } from "../permissions";

export type OrderUseCaseError =
  | OrderError
  | ForbiddenError
  | { type: "ITEM_NOT_FOUND"; menuItemId: string }
  | { type: "ORDER_NOT_FOUND" }
  /** Someone else moved the order first (or the database refused this user). Reload and try again. */
  | { type: "CONFLICT" };

/**
 * The kind of visit an order belongs to (a table, or a takeout pickup), which decides who may move it. A visit that
 * cannot be read, or belongs to another restaurant, counts as a table: the stricter rule.
 */
export async function orderVisitKind(
  sessions: Pick<TableSessionRepository, "findWithTables">,
  restaurantId: RestaurantId,
  sessionId: TableSessionId,
): Promise<SessionKind> {
  const [visit] = await sessions.findWithTables(restaurantId, [sessionId]);
  return visit?.session.restaurantId === restaurantId ? visit.session.kind : "TABLE";
}
