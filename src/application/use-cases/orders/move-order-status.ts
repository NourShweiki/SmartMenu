import type { OrderRepository } from "@/application/ports/order-repository";
import type { Clock } from "@/application/ports/system";
import {
  moveOrderTo,
  permissionToMoveTo,
  shouldNotifyCustomer,
  type Order,
  type OrderId,
  type OrderStatus,
} from "@/domain/order/order";
import { err, ok, type Result } from "@/domain/shared/result";
import { requirePermission, type StaffActor } from "../permissions";
import type { OrderUseCaseError } from "./shared";

export type MoveOrderStatusResult = {
  order: Order;
  /** True when the customer's devices should be told (the order just became READY). Sending is a later step. */
  notifyCustomer: boolean;
};

/**
 * Moves an order one step along NEW -> ... -> COMPLETED. The waiter / kitchen side needs `orders:confirm`;
 * the last step (COMPLETED, after payment) needs `payments:close`, which is the cashier's. The database
 * enforces the same split and the one-step rule, so this never relies on the screen alone.
 */
export function makeMoveOrderStatus(deps: { orders: OrderRepository; clock: Clock }) {
  return async (
    actor: StaffActor,
    input: { orderId: OrderId; to: OrderStatus },
  ): Promise<Result<MoveOrderStatusResult, OrderUseCaseError>> => {
    const allowed = requirePermission(actor, permissionToMoveTo(input.to));
    if (!allowed.ok) return allowed;

    const order = await deps.orders.findById(actor.restaurantId, input.orderId);
    if (!order) return err({ type: "ORDER_NOT_FOUND" });

    const moved = moveOrderTo(order, input.to, deps.clock.now());
    if (!moved.ok) return moved;

    const saved = await deps.orders.updateStatus(actor.restaurantId, order.id, order.status, input.to);
    if (!saved) return err({ type: "CONFLICT" });
    return ok({ order: moved.value, notifyCustomer: shouldNotifyCustomer(input.to) });
  };
}
