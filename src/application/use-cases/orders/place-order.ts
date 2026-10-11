import type { OrderRepository } from "@/application/ports/order-repository";
import type { OrderingCatalog } from "@/application/ports/ordering-catalog";
import type { Clock, IdGenerator } from "@/application/ports/system";
import type { MenuItemId } from "@/domain/menu/menu";
import { createOrder, pickupRates, type Order, type OrderLineRequest, type OrderRates, type TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import { isUuid } from "@/domain/shared/uuid";
import { createPickupCustomer, type PickupCustomer, type PickupError, type SessionKind } from "@/domain/table-session/pickup";
import type { OrderUseCaseError } from "./shared";

export type PlaceOrderInput = {
  /** From the host (getCurrentSite), never from the request body. */
  restaurantId: RestaurantId;
  sessionId: TableSessionId;
  /**
   * The kind of visit the session is, as the server read it (never from the customer). A PICKUP visit's orders carry
   * no service charge: the use case drops it from `rates` itself, so no caller can forget.
   */
  kind: SessionKind;
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

type PlaceDeps = { orders: OrderRepository; catalog: OrderingCatalog; ids: IdGenerator; clock: Clock };

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
 * Turns a cart into a NEW order in a visit that exists: loads the live menu, lets the domain check every line and
 * compute the totals, then stores the order atomically. Ordering more after an earlier order is just another call
 * for the same session (spec §4): it starts again at NEW. This is how guests at a table order, and how a takeout
 * customer adds to a pickup visit that is still open.
 *
 * A repeated submission (same `requestId` in the same session, e.g. the reply was lost and the guest pressed again)
 * returns the order that was already placed: no second order, no new number, and no fresh look at the menu (the
 * order exists, whatever sold out since).
 */
export function makePlaceOrder(deps: PlaceDeps) {
  return (input: PlaceOrderInput): Promise<Result<Order, OrderUseCaseError>> => place(deps, input);
}

export type PlacePickupOrderInput = {
  /** From the host (getCurrentSite), never from the request body. */
  restaurantId: RestaurantId;
  /** The restaurant's current rates; the service charge is dropped here (takeout has none). */
  rates: OrderRates;
  lines: PlaceOrderInput["lines"];
  /**
   * The device's key for this submission. REQUIRED for takeout: it also becomes the id of the pickup visit, which
   * is what lets a submission that arrives twice find the visit (and the order) it already made.
   */
  requestId: string;
  /** Name and mobile number as the customer typed them. */
  customer: { name: string; phone: string };
};

export type PlacePickupOrderError = OrderUseCaseError | PickupError | { type: "INVALID_REQUEST" };

/**
 * A takeout customer places an order without a table: the order starts its own PICKUP visit, stored together with
 * it (never a visit without an order). The caller checks that the restaurant takes takeout orders at all (its
 * settings); the store refuses too when takeout is switched off.
 *
 * Returns the order, whose `sessionId` is the new visit: the caller hands it to the customer's device (as it does
 * for a table), which is how the customer follows the order and can add to it while it is in progress.
 */
export function makePlacePickupOrder(deps: PlaceDeps) {
  return async (input: PlacePickupOrderInput): Promise<Result<{ order: Order; customer: PickupCustomer }, PlacePickupOrderError>> => {
    if (!isUuid(input.requestId)) return err({ type: "INVALID_REQUEST" });
    const customer = createPickupCustomer(input.customer);
    if (!customer.ok) return customer;

    const sessionId = input.requestId.toLowerCase() as TableSessionId;
    const order = await place(
      deps,
      { restaurantId: input.restaurantId, sessionId, kind: "PICKUP", rates: input.rates, lines: input.lines, requestId: input.requestId },
      customer.value,
    );
    return order.ok ? ok({ order: order.value, customer: customer.value }) : order;
  };
}

/** Both ways of ordering. With `startPickupFor`, the order's session is started with it, as that customer's pickup visit. */
async function place(deps: PlaceDeps, input: PlaceOrderInput, startPickupFor?: PickupCustomer): Promise<Result<Order, OrderUseCaseError>> {
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
  const rates = input.kind === "PICKUP" ? pickupRates(input.rates) : input.rates;
  const base = { restaurantId: input.restaurantId, sessionId: input.sessionId, lines, rates };
  // Dry run with a placeholder number: a bad cart is refused BEFORE it uses up a real order number.
  const check = createOrder({ ...base, number: 1 }, deps.ids, now);
  if (!check.ok) return check;

  const number = await deps.orders.nextNumber(input.restaurantId);
  const order = createOrder({ ...base, number }, deps.ids, now);
  if (!order.ok) return order;
  const storedId = await deps.orders.place(order.value, input.requestId, startPickupFor);
  if (storedId === order.value.id) return order;
  // The same submission arrived twice at the same moment and the other one was stored first: that is the order.
  const earlier = await deps.orders.findById(input.restaurantId, storedId);
  if (!earlier) throw new Error(`place returned order ${storedId}, which cannot be read back`);
  return ok(earlier);
}
