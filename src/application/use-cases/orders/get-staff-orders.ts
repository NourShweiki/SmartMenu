import type { OrderRepository } from "@/application/ports/order-repository";
import type { Order, TableSessionId } from "@/domain/order/order";
import type { StaffActor } from "../permissions";

/**
 * The orders a signed-in staff member sees: the open queue (everything not COMPLETED), or one table
 * session's orders. Every role may read orders (the cashier needs them to bill), so there is no extra
 * permission; the actor only scopes the restaurant, and RLS applies again in the database.
 */
export function makeGetStaffOrders(deps: { orders: OrderRepository }) {
  return async (actor: StaffActor, query: { sessionId?: TableSessionId } = {}): Promise<Order[]> =>
    query.sessionId
      ? deps.orders.listBySession(actor.restaurantId, query.sessionId)
      : deps.orders.listOpen(actor.restaurantId);
}
