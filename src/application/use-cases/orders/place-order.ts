import type { OrderRepository } from "@/application/ports/order-repository";
import type { OrderingCatalog } from "@/application/ports/ordering-catalog";
import type { Clock, IdGenerator } from "@/application/ports/system";
import type { MenuItemId } from "@/domain/menu/menu";
import { createOrder, type Order, type OrderLineRequest, type OrderRates, type TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import type { OrderUseCaseError } from "./shared";

export type PlaceOrderInput = {
  /** From the host (getCurrentSite), never from the request body. */
  restaurantId: RestaurantId;
  sessionId: TableSessionId;
  /** The restaurant's current tax / service rates, read by the server from its settings (not from the customer). */
  rates: OrderRates;
  /** The cart as the customer sent it: ids and quantities only. Names and prices come from the live menu. */
  lines: readonly { menuItemId: string; quantity: number; selectedOptionIds: readonly string[] }[];
  /**
   * One random key per submission, made up by the customer's device; a retry sends the same key. With it, placing
   * is safe to repeat: the second call returns the first order. Without it every call is a new order.
   */
  requestId?: string;
};

/**
 * The order a submission already produced, if it did: the same lookup `placeOrder` starts with, on its own. For
 * the moment when no NEW order may be placed any more (the table visit stopped taking orders) but the guest's
 * earlier attempt, whose reply was lost, did go through.
 */
export function makeFindPlacedOrder(deps: { orders: OrderRepository }) {
  return (input: { restaurantId: RestaurantId; sessionId: TableSessionId; requestId: string }): Promise<Order | null> =>
    deps.orders.findByRequest(input.restaurantId, input.sessionId, input.requestId);
}

/**
 * Turns a cart into a NEW order: loads the live menu, lets the domain check every line and compute the
 * totals, then stores the order atomically. Ordering more after an earlier order is just another call for
 * the same session (spec §4): it starts again at NEW.
 *
 * A repeated submission (same `requestId` in the same session, e.g. the reply was lost and the guest pressed again)
 * returns the order that was already placed: no second order, no new number, and no fresh look at the menu (the
 * order exists, whatever sold out since).
 */
export function makePlaceOrder(deps: {
  orders: OrderRepository;
  catalog: OrderingCatalog;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async (input: PlaceOrderInput): Promise<Result<Order, OrderUseCaseError>> => {
    if (input.requestId) {
      const earlier = await deps.orders.findByRequest(input.restaurantId, input.sessionId, input.requestId);
      if (earlier) return ok(earlier);
    }

    const entries = await deps.catalog.findEntries(
      input.restaurantId,
      input.lines.map((l) => l.menuItemId as MenuItemId),
    );
    const byItem = new Map(entries.map((e) => [e.item.id as string, e]));

    const lines: OrderLineRequest[] = [];
    for (const line of input.lines) {
      const entry = byItem.get(line.menuItemId);
      if (!entry) return err({ type: "ITEM_NOT_FOUND", menuItemId: line.menuItemId });
      lines.push({ ...entry, selectedOptionIds: line.selectedOptionIds, quantity: line.quantity });
    }

    const now = deps.clock.now();
    const base = { restaurantId: input.restaurantId, sessionId: input.sessionId, lines, rates: input.rates };
    // Dry run with a placeholder number: a bad cart is refused BEFORE it uses up a real order number.
    const check = createOrder({ ...base, number: 1 }, deps.ids, now);
    if (!check.ok) return check;

    const number = await deps.orders.nextNumber(input.restaurantId);
    const order = createOrder({ ...base, number }, deps.ids, now);
    if (!order.ok) return order;
    const storedId = await deps.orders.place(order.value, input.requestId);
    if (storedId === order.value.id) return order;
    // The same submission arrived twice at the same moment and the other one was stored first: that is the order.
    const earlier = await deps.orders.findById(input.restaurantId, storedId);
    if (!earlier) throw new Error(`place returned order ${storedId}, which cannot be read back`);
    return ok(earlier);
  };
}
