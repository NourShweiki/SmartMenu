import type { OrderRepository } from "@/application/ports/order-repository";
import type { Clock } from "@/application/ports/system";
import type { TableSessionRepository } from "@/application/ports/table-session-repository";
import type { Order } from "@/domain/order/order";
import type { PickupCustomer, SessionKind } from "@/domain/table-session/pickup";
import { effectiveSessionStatus, type SessionStatus, type TableSessionId } from "@/domain/table-session/table-session";
import type { StaffActor } from "../permissions";

/** One line of the staff order screen: the order, and where it goes. */
export type StaffOrderEntry = {
  readonly order: Order;
  /**
   * The visit the order belongs to and its state ("ready to pay", closed ...): a table (`label`) or a pickup visit
   * (`customer`: the takeout customer's name and number; `label` is then null). Null only when the visit cannot be
   * read, which should not happen (every order belongs to a session of its restaurant); the screen then still
   * shows the order, without a table.
   */
  readonly table: {
    readonly sessionId: TableSessionId;
    readonly kind: SessionKind;
    readonly label: string | null;
    readonly customer: PickupCustomer | null;
    readonly sessionStatus: SessionStatus;
  } | null;
};

/**
 * What a signed-in staff member sees on the order screen: the open queue (everything not COMPLETED), or the orders
 * of one table session (the running bill), each with its table. Every role may read orders (the cashier needs them
 * to bill), so there is no extra permission: the actor only scopes the restaurant, and RLS applies again.
 *
 * The visit's status is the one staff should act on: a visit that ran out of time counts as CLOSED (see
 * `effectiveSessionStatus`).
 */
export function makeGetStaffOrderList(deps: { orders: OrderRepository; sessions: TableSessionRepository; clock: Clock }) {
  return async (actor: StaffActor, query: { sessionId?: TableSessionId } = {}): Promise<StaffOrderEntry[]> => {
    const orders = query.sessionId
      ? await deps.orders.listBySession(actor.restaurantId, query.sessionId)
      : await deps.orders.listOpen(actor.restaurantId);
    if (orders.length === 0) return [];

    // One question for all the tables on the screen, not one per order.
    const sessionIds = [...new Set(orders.map((o) => o.sessionId))];
    const found = await deps.sessions.findWithTables(actor.restaurantId, sessionIds);
    const now = deps.clock.now();
    const tables = new Map(
      found
        .filter(({ session }) => session.restaurantId === actor.restaurantId) // never another restaurant's table, whatever the store returns
        .map(({ session, tableLabel }) => [
          session.id as string,
          { sessionId: session.id, kind: session.kind, label: tableLabel, customer: session.customer, sessionStatus: effectiveSessionStatus(session, now) },
        ]),
    );
    return orders.map((order) => ({ order, table: tables.get(order.sessionId) ?? null }));
  };
}
