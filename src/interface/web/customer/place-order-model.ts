import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import type { PublicSession } from "@/application/ports/table-session-gateway";
import type { PlaceOrderInput } from "@/application/use-cases/orders/place-order";
import type { OrderUseCaseError } from "@/application/use-cases/orders/shared";
import { MAX_ORDER_LINES, type Order } from "@/domain/order/order";
import type { Result } from "@/domain/shared/result";
import type { SessionStatus } from "@/domain/table-session/table-session";

/** Why an order was not placed, as the cart shows it (one translated message each: `Menu.order.errors.<problem>`). */
export type PlaceOrderProblem =
  | "noTable" // no QR code scanned on this device (or the session is not this restaurant's)
  | "sessionEnded" // the visit was closed or ran out of time: scan again
  | "paymentRequested" // the bill is being prepared: ask the waiter
  | "orderingOff" // the restaurant switched dine-in ordering off
  | "empty"
  | "tooLarge"
  | "itemsChanged" // something in the cart was sold out, removed or changed since it was added
  | "failed"; // anything unexpected

export type PlaceOrderOutcome = { ok: true; orderNumber: number } | { ok: false; problem: PlaceOrderProblem };

type CartLines = PlaceOrderInput["lines"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/**
 * Reads the cart lines the browser sent. STRICT, unlike `parseCart` (which forgives a damaged saved cart): an order
 * must be exactly what the customer saw, so one odd line refuses the whole request (null) instead of being dropped.
 * Only shapes are checked here (a quantity is a whole number from 1); limits and the menu itself are the domain's job.
 */
export function readCartLines(cart: unknown): CartLines | null {
  const raw = typeof cart === "object" && cart !== null ? (cart as { lines?: unknown }).lines : undefined;
  // The cap keeps a hostile request small before anything is looked up; the domain enforces the real limit.
  if (!Array.isArray(raw) || raw.length > MAX_ORDER_LINES * 2) return null;
  const lines: CartLines[number][] = [];
  for (const entry of raw) {
    const line = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    const { menuItemId, optionIds, quantity } = line;
    if (!isId(menuItemId) || !Array.isArray(optionIds) || optionIds.length > 100 || !optionIds.every(isId)) return null;
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1) return null;
    lines.push({ menuItemId, quantity, selectedOptionIds: optionIds });
  }
  return lines;
}

/**
 * The device's key for this submission (see request-key.ts). Required: every order from the cart must be safe to
 * send twice. Anything that is not a UUID refuses the request.
 */
export function readRequestId(cart: unknown): string | null {
  const id = typeof cart === "object" && cart !== null ? (cart as { requestId?: unknown }).requestId : undefined;
  return isId(id) ? id : null;
}

const sessionProblem = (status: SessionStatus): PlaceOrderProblem | null =>
  status === "OPEN" ? null : status === "PAYMENT_REQUESTED" ? "paymentRequested" : "sessionEnded";

/** Every way the use case refuses a customer's cart, as what the cart shows. */
export function orderProblem(error: OrderUseCaseError): PlaceOrderProblem {
  switch (error.type) {
    case "EMPTY_ORDER":
      return "empty";
    case "TOO_MANY_LINES":
    case "ORDER_TOO_LARGE":
    case "INVALID_QUANTITY": // more than the limit per line: anything else was refused as a malformed cart
      return "tooLarge";
    case "ITEM_NOT_FOUND":
    case "ITEM_NOT_ORDERABLE":
    case "SELECTION":
      return "itemsChanged";
    default:
      return "failed";
  }
}

export type PlaceCustomerOrderDeps = {
  findSession: (input: { slug: string; sessionId: string }) => Promise<PublicSession | null>;
  place: (input: PlaceOrderInput) => Promise<Result<Order, OrderUseCaseError>>;
  /** The order this submission already produced in this table session, if any (asked only when no new order may be placed). */
  findPlaced: (input: Pick<PlaceOrderInput, "restaurantId" | "sessionId"> & { requestId: string }) => Promise<Order | null>;
};

/**
 * A guest presses "Place order". Nothing the browser says is trusted except WHAT is in the cart (ids and
 * quantities) and its key for this submission (which only makes a repeat harmless): the restaurant comes from the host, the session from the HttpOnly cookie, the rates from the
 * restaurant's current settings, names and prices from the live menu (inside the use case).
 *
 * The session's status comes from the database, which already reports a visit older than 2 hours as CLOSED
 * (`get_public_session`), so "OPEN" here means "accepts orders". The orders insert trigger checks it once more.
 */
export async function placeCustomerOrder(
  deps: PlaceCustomerOrderDeps,
  input: { restaurant: PublicRestaurant; sessionId: string | null; cart: unknown },
): Promise<PlaceOrderOutcome> {
  const { restaurant, sessionId } = input;
  const refuse = (problem: PlaceOrderProblem): PlaceOrderOutcome => ({ ok: false, problem });

  if (!restaurant.settings.dineInEnabled) return refuse("orderingOff");
  if (!sessionId) return refuse("noTable");
  const lines = readCartLines(input.cart);
  const requestId = readRequestId(input.cart);
  if (!lines || !requestId) return refuse("failed");
  if (lines.length === 0) return refuse("empty");

  const find = () => deps.findSession({ slug: restaurant.slug, sessionId });
  const session = await find();
  // Ordering at a table. (A phone that holds a pickup visit orders through the takeout path, not here.)
  if (!session || session.kind !== "TABLE") return refuse("noTable");
  const closed = sessionProblem(session.status);
  if (closed) {
    // The visit no longer takes orders. But if THIS submission went through before that (its reply was lost and the
    // guest is pressing again), the honest answer is its order number, not "scan again": otherwise the guest would
    // scan, send the same cart in the new visit, and the kitchen would get it twice.
    const earlier = await deps.findPlaced({ restaurantId: restaurant.id, sessionId: session.sessionId, requestId });
    return earlier ? { ok: true, orderNumber: earlier.number } : refuse(closed);
  }

  try {
    const result = await deps.place({
      restaurantId: restaurant.id,
      sessionId: session.sessionId,
      kind: "TABLE",
      rates: { taxRateBp: restaurant.settings.taxRateBp, serviceChargeBp: restaurant.settings.serviceChargeBp },
      lines,
      requestId, // a retry of the same submission gets the order that is already there
    });
    if (result.ok) return { ok: true, orderNumber: result.value.number };
    const problem = orderProblem(result.error);
    // A refusal no guest can cause (bad rates in the settings, ...): leave a trace, the guest only sees "try again".
    if (problem === "failed") console.error("placing a customer order was refused unexpectedly", result.error);
    return refuse(problem);
  } catch (error) {
    // Most likely the visit ended between the check above and the insert (the database refused it): say so
    // rather than "something went wrong". Anything else is a real fault: log it, show the generic message.
    const now = await find().catch(() => null);
    const reason = now ? sessionProblem(now.status) : null;
    if (reason) return refuse(reason);
    console.error("placing a customer order failed", error);
    return refuse("failed");
  }
}
