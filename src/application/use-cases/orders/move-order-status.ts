import type { OrderRepository } from "@/application/ports/order-repository";
import type { Clock } from "@/application/ports/system";
import type { TableSessionRepository } from "@/application/ports/table-session-repository";
import {
  moveOrderTo,
  permissionsToMoveTo,
  shouldNotifyCustomer,
  type Order,
  type OrderId,
  type OrderStatus,
} from "@/domain/order/order";
import { err, ok, type Result } from "@/domain/shared/result";
import { can } from "@/domain/restaurant/role";
import type { StaffActor } from "../permissions";
import type { OrderUseCaseError } from "./shared";

export type MoveOrderStatusResult = {
  order: Order;
  /** True when the customer's devices should be told (the order just became READY). Sending is a later step. */
  notifyCustomer: boolean;
};

/**
 * Moves an order one step along NEW -> ... -> COMPLETED. The waiter / kitchen side needs `orders:confirm`;
 * the last step (COMPLETED, after payment) needs `payments:close`, which is the cashier's. On a PICKUP (takeout)
 * order the cashier's permission is enough for every step (`permissionsToMoveTo`), so the kind of the order's
 * visit is looked up first. The database enforces the same split and the one-step rule, so this never relies on
 * the screen alone.
 */
export function makeMoveOrderStatus(deps: { orders: OrderRepository; sessions: Pick<TableSessionRepository, "findWithTables">; clock: Clock }) {
  return async (
    actor: StaffActor,
    input: { orderId: OrderId; to: OrderStatus },
  ): Promise<Result<MoveOrderStatusResult, OrderUseCaseError>> => {
    // Nobody without one of the two permissions moves any order: refused before anything is read.
    if (!can(actor.role, "orders:confirm") && !can(actor.role, "payments:close")) return err({ type: "FORBIDDEN" });

    const order = await deps.orders.findById(actor.restaurantId, input.orderId);
    if (!order) return err({ type: "ORDER_NOT_FOUND" });

    // A visit that cannot be read counts as a table: the stricter rule.
    const [visit] = await deps.sessions.findWithTables(actor.restaurantId, [order.sessionId]);
    const kind = visit?.session.restaurantId === actor.restaurantId ? visit.session.kind : "TABLE";
    if (!permissionsToMoveTo(input.to, kind).some((permission) => can(actor.role, permission))) return err({ type: "FORBIDDEN" });

    const moved = moveOrderTo(order, input.to, deps.clock.now());
    if (!moved.ok) return moved;

    const saved = await deps.orders.updateStatus(actor.restaurantId, order.id, order.status, input.to);
    if (!saved) return err({ type: "CONFLICT" });
    return ok({ order: moved.value, notifyCustomer: shouldNotifyCustomer(input.to) });
  };
}
