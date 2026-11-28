import type { OrderRepository } from "@/application/ports/order-repository";
import type { Clock } from "@/application/ports/system";
import type { TableSessionRepository } from "@/application/ports/table-session-repository";
import { kitchenAction, type KitchenTap } from "@/domain/order/kitchen-board";
import { moveOrderTo, shouldNotifyCustomer, type Order, type OrderId, type OrderStatus } from "@/domain/order/order";
import { can } from "@/domain/restaurant/role";
import { err, ok, type Result } from "@/domain/shared/result";
import type { StaffActor } from "../permissions";
import { orderVisitKind, type OrderUseCaseError } from "./shared";

export type KitchenTapResult = {
  /** The order as it is now (after the steps that were taken). */
  order: Order;
  /** The statuses it moved to, in order. Never empty on success. */
  moved: readonly OrderStatus[];
  /**
   * False when someone else moved the order between two steps of this tap: the order stopped at a normal status in
   * between (it stays in the same column of the board) and the next tap carries on from there.
   */
  complete: boolean;
  /** True when the order became READY during this tap: the customer's devices should be told. */
  notifyCustomer: boolean;
};

/**
 * One tap on the kitchen screen (PROJECT_SPEC.md §3.3): "Start", "Ready" or "Picked up". The SERVER works out what
 * the tap means from the order as it is now (`kitchenAction`: its status, its kind of visit, the person's role);
 * the screen only says which button was pressed. If that is not the button the order offers any more (someone else
 * moved it, or the screen is out of date), nothing happens: CONFLICT.
 *
 * The tap then takes its steps one after another, each the same conditional single-step move as the Orders screen
 * (`updateStatus` from the status it is in now), so the database checks every step exactly as before: one step at
 * a time, by role. No new database rule is needed. If a later step is refused because someone else moved the order
 * in the meantime, the steps already taken stay (each is a valid status) and the result says it is not complete.
 */
export function makeKitchenTap(deps: { orders: OrderRepository; sessions: Pick<TableSessionRepository, "findWithTables">; clock: Clock }) {
  return async (actor: StaffActor, input: { orderId: OrderId; tap: KitchenTap }): Promise<Result<KitchenTapResult, OrderUseCaseError>> => {
    // Nobody without one of the two permissions moves any order: refused before anything is read.
    if (!can(actor.role, "orders:confirm") && !can(actor.role, "payments:close")) return err({ type: "FORBIDDEN" });

    const found = await deps.orders.findById(actor.restaurantId, input.orderId);
    if (!found) return err({ type: "ORDER_NOT_FOUND" });

    const kind = await orderVisitKind(deps.sessions, actor.restaurantId, found.sessionId);
    const action = kitchenAction(found.status, kind, actor.role);
    if (!action) return err({ type: "FORBIDDEN" });
    if (action.tap !== input.tap) return err({ type: "CONFLICT" });

    let order = found;
    const moved: OrderStatus[] = [];
    for (const step of action.steps) {
      const next = moveOrderTo(order, step, deps.clock.now());
      if (!next.ok) break; // cannot happen: the steps follow the flow; stop rather than skip one
      const saved = await deps.orders.updateStatus(actor.restaurantId, order.id, order.status, step);
      if (!saved) break;
      order = next.value;
      moved.push(step);
    }

    if (moved.length === 0) return err({ type: "CONFLICT" });
    return ok({
      order,
      moved,
      complete: moved.length === action.steps.length,
      notifyCustomer: moved.some(shouldNotifyCustomer),
    });
  };
}
