import type { OrderRepository } from "@/application/ports/order-repository";
import type { Clock } from "@/application/ports/system";
import { cancelOrder, permissionToCancel, type Order, type OrderId } from "@/domain/order/order";
import { err, ok, type Result } from "@/domain/shared/result";
import { requirePermission, type StaffActor } from "../permissions";
import type { OrderUseCaseError } from "./shared";

/**
 * A member of staff cancels an order (PROJECT_SPEC §4): the waiter while it is NEW or CONFIRMED, the owner and
 * manager any order that is not COMPLETED, the cashier never. The order is kept, marked CANCELLED with the reason;
 * the database stamps when and who, and enforces the same rules again (migration cancel_orders).
 *
 * `reason` arrives as the text a form sent: the domain accepts only the fixed list.
 */
export function makeCancelOrder(deps: { orders: Pick<OrderRepository, "findById" | "cancel">; clock: Clock }) {
  return async (actor: StaffActor, input: { orderId: OrderId; reason: string }): Promise<Result<Order, OrderUseCaseError>> => {
    const order = await deps.orders.findById(actor.restaurantId, input.orderId);
    if (!order) return err({ type: "ORDER_NOT_FOUND" });

    // Which permission depends on how far the order has got. None at all = it cannot be cancelled by anybody
    // (completed, or cancelled already): the domain says so below.
    const permission = permissionToCancel(order.status);
    if (permission) {
      const allowed = requirePermission(actor, permission);
      if (!allowed.ok) return allowed;
    }

    const cancelled = cancelOrder(order, input.reason, deps.clock.now());
    if (!cancelled.ok) return cancelled;

    const saved = await deps.orders.cancel(actor.restaurantId, order.id, order.status, cancelled.value.cancellation.reason);
    if (!saved) return err({ type: "CONFLICT" });
    // What is stored is the truth (the database stamped the time and the person).
    return ok((await deps.orders.findById(actor.restaurantId, order.id)) ?? cancelled.value);
  };
}
