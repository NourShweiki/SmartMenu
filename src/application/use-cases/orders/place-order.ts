import type { OrderRepository } from "@/application/ports/order-repository";
import type { OrderingCatalog } from "@/application/ports/ordering-catalog";
import type { Clock, IdGenerator } from "@/application/ports/system";
import type { MenuItemId } from "@/domain/menu/menu";
import { createOrder, type Order, type OrderLineRequest, type OrderRates, type TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, type Result } from "@/domain/shared/result";
import type { OrderUseCaseError } from "./shared";

export type PlaceOrderInput = {
  /** From the host (getCurrentSite), never from the request body. */
  restaurantId: RestaurantId;
  sessionId: TableSessionId;
  /** The restaurant's current tax / service rates, read by the server from its settings (not from the customer). */
  rates: OrderRates;
  /** The cart as the customer sent it: ids and quantities only. Names and prices come from the live menu. */
  lines: readonly { menuItemId: string; quantity: number; selectedOptionIds: readonly string[] }[];
};

/**
 * Turns a cart into a NEW order: loads the live menu, lets the domain check every line and compute the
 * totals, then stores the order atomically. Ordering more after an earlier order is just another call for
 * the same session (spec §4): it starts again at NEW.
 */
export function makePlaceOrder(deps: {
  orders: OrderRepository;
  catalog: OrderingCatalog;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async (input: PlaceOrderInput): Promise<Result<Order, OrderUseCaseError>> => {
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
    await deps.orders.place(order.value);
    return order;
  };
}
