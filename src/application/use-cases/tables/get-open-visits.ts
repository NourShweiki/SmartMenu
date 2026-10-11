import type { OrderRepository } from "@/application/ports/order-repository";
import type { Clock } from "@/application/ports/system";
import type { TableSessionRepository } from "@/application/ports/table-session-repository";
import { billTotals, isUnfinished, type BillTotals, type Order } from "@/domain/order/order";
import { effectiveSessionStatus, type SessionStatus, type TableSession } from "@/domain/table-session/table-session";
import type { StaffActor } from "../permissions";

/** One table that has guests (or had, and was never closed), as the staff "open tables" screen needs it. */
export type OpenVisit = {
  readonly session: TableSession;
  readonly tableLabel: string;
  /**
   * The status to show and act on. CLOSED here means the visit ran past its 2 hours and nobody has closed it yet:
   * guests can no longer order, and it stays listed until staff close it properly.
   */
  readonly status: SessionStatus;
  /** Every order of the visit, oldest first, completed ones included: together they are the bill. */
  readonly orders: readonly Order[];
  readonly bill: BillTotals;
  /** How many of its orders are not COMPLETED yet. A visit cannot be closed while this is above zero. */
  readonly unfinished: number;
};

/**
 * The visits that are not closed yet, oldest first, each with its orders and running bill. Every role may read
 * them (the waiter signals "ready to pay", the cashier bills and closes): the actor only scopes the restaurant,
 * and RLS applies again. Two questions for the whole screen: the visits, then all their orders at once.
 */
export function makeGetOpenVisits(deps: {
  sessions: Pick<TableSessionRepository, "listLive">;
  orders: Pick<OrderRepository, "listBySessions">;
  clock: Clock;
}) {
  return async (actor: StaffActor): Promise<OpenVisit[]> => {
    // Tables only: a pickup visit has no table and ends with its last order (the store already leaves them out).
    const live = (await deps.sessions.listLive(actor.restaurantId)).flatMap(({ session, tableLabel }) =>
      session.restaurantId === actor.restaurantId && session.kind === "TABLE" && tableLabel !== null ? [{ session, tableLabel }] : [],
    );
    if (live.length === 0) return [];

    const all = await deps.orders.listBySessions(actor.restaurantId, live.map(({ session }) => session.id));
    const bySession = new Map<string, Order[]>();
    for (const order of all) {
      if (order.restaurantId !== actor.restaurantId) continue; // never another restaurant's order, whatever the store returns
      const list = bySession.get(order.sessionId);
      if (list) list.push(order);
      else bySession.set(order.sessionId, [order]);
    }

    const now = deps.clock.now();
    return live.map(({ session, tableLabel }) => {
      const orders = bySession.get(session.id) ?? [];
      return {
        session,
        tableLabel,
        status: effectiveSessionStatus(session, now),
        orders,
        bill: billTotals(orders),
        unfinished: orders.filter(isUnfinished).length,
      };
    });
  };
}
