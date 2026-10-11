import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import type { PublicSession } from "@/application/ports/table-session-gateway";
import type { PlaceOrderInput, PlacePickupOrderError, PlacePickupOrderInput } from "@/application/use-cases/orders/place-order";
import type { OrderUseCaseError } from "@/application/use-cases/orders/shared";
import { MAX_ORDER_LINES, type Order } from "@/domain/order/order";
import type { Result } from "@/domain/shared/result";
import type { SessionStatus } from "@/domain/table-session/table-session";

/** Why an order was not placed, as the cart shows it (one translated message each: `Menu.order.errors.<problem>`). */
export type PlaceOrderProblem =
  | "noTable" // no QR code scanned on this device (or the session is not this restaurant's), and no takeout here
  | "sessionEnded" // the visit was closed or ran out of time: scan again
  | "paymentRequested" // the bill is being prepared: ask the waiter
  | "orderingOff" // the restaurant switched dine-in ordering off
  | "empty"
  | "tooLarge"
  | "itemsChanged" // something in the cart was sold out, removed or changed since it was added
  | "nameRequired" // takeout: no name given
  | "nameInvalid" // takeout: a name that is too long or has characters that cannot be in one
  | "phoneInvalid" // takeout: not a Jordanian mobile number
  | "failed"; // anything unexpected

export type PlaceOrderOutcome =
  /** `startedVisit`: the order started a new pickup visit; the server remembers it on this device (the cookie). */
  | { ok: true; orderNumber: number; startedVisit?: string }
  | { ok: false; problem: PlaceOrderProblem };

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

/**
 * The name and mobile number a takeout customer typed, exactly as typed (the domain tidies and checks them). Null
 * when the cart carries none. Over-long input is cut before anything looks at it.
 */
export function readPickupCustomer(cart: unknown): { name: string; phone: string } | null {
  const raw = typeof cart === "object" && cart !== null ? (cart as { customer?: unknown }).customer : undefined;
  if (typeof raw !== "object" || raw === null) return null;
  const { name, phone } = raw as { name?: unknown; phone?: unknown };
  if (typeof name !== "string" || typeof phone !== "string") return null;
  return { name: name.slice(0, 200), phone: phone.slice(0, 40) };
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
  /** Starts a pickup visit with its first order (takeout). */
  placePickup: (input: PlacePickupOrderInput) => Promise<Result<{ order: Order }, PlacePickupOrderError>>;
  /** The order this submission already produced in this table session, if any (asked only when no new order may be placed). */
  findPlaced: (input: Pick<PlaceOrderInput, "restaurantId" | "sessionId"> & { requestId: string }) => Promise<Order | null>;
};

type Refusal = { ok: false; problem: PlaceOrderProblem };
const refuse = (problem: PlaceOrderProblem): Refusal => ({ ok: false, problem });

/**
 * A guest presses "Place order". Nothing the browser says is trusted except WHAT is in the cart (ids and
 * quantities), its key for this submission (which only makes a repeat harmless) and, for takeout, the name and
 * number the customer typed: the restaurant comes from the host, the visit from the HttpOnly cookie, the rates from
 * the restaurant's current settings, names and prices from the live menu (inside the use case).
 *
 * Which way the order goes (PROJECT_SPEC.md §4): a phone that holds a live TABLE visit orders for that table; where
 * the restaurant takes takeout orders, any other phone orders takeout: into the pickup visit it already holds while
 * that is open, otherwise as a new pickup visit (the answer then names the visit, for the cookie).
 *
 * A visit's status comes from the database, which already reports one older than 2 hours as CLOSED
 * (`get_public_session`), so "OPEN" here means "accepts orders". The orders insert trigger checks it once more.
 */
export async function placeCustomerOrder(
  deps: PlaceCustomerOrderDeps,
  input: { restaurant: PublicRestaurant; sessionId: string | null; cart: unknown },
): Promise<PlaceOrderOutcome> {
  const { restaurant, sessionId } = input;
  const { settings } = restaurant;
  const takeout = settings.takeoutEnabled;

  if (!settings.dineInEnabled && !takeout) return refuse("orderingOff");
  if (!takeout && !sessionId) return refuse("noTable");
  const lines = readCartLines(input.cart);
  const requestId = readRequestId(input.cart);
  if (!lines || !requestId) return refuse("failed");
  if (lines.length === 0) return refuse("empty");

  const rates = { taxRateBp: settings.taxRateBp, serviceChargeBp: settings.serviceChargeBp };
  const find = () => (sessionId ? deps.findSession({ slug: restaurant.slug, sessionId }) : Promise.resolve(null));
  const session = await find();

  /** An order into a visit that exists. A thrown refusal most likely means the visit ended in between: say so. */
  const placeInto = async (visit: PublicSession): Promise<PlaceOrderOutcome> => {
    try {
      const result = await deps.place({ restaurantId: restaurant.id, sessionId: visit.sessionId, kind: visit.kind, rates, lines, requestId });
      if (result.ok) return { ok: true, orderNumber: result.value.number };
      return refuseLogged(result.error);
    } catch (error) {
      const now = await find().catch(() => null);
      const reason = now ? sessionProblem(now.status) : null;
      if (reason) return refuse(reason);
      console.error("placing a customer order failed", error);
      return refuse("failed");
    }
  };

  // ── At a table ──
  if (session?.kind === "TABLE" && (settings.dineInEnabled || !takeout)) {
    if (!settings.dineInEnabled) return refuse("orderingOff");
    const closed = sessionProblem(session.status);
    if (!closed) return placeInto(session);
    // The visit no longer takes orders. But if THIS submission went through before that (its reply was lost and the
    // guest is pressing again), the honest answer is its order number, not "scan again": otherwise the guest would
    // scan, send the same cart in the new visit, and the kitchen would get it twice.
    const earlier = await deps.findPlaced({ restaurantId: restaurant.id, sessionId: session.sessionId, requestId });
    if (earlier) return { ok: true, orderNumber: earlier.number };
    // The bill is being prepared: not the moment to start a takeout order from the table. A visit that is over is no
    // table any more: where the restaurant takes takeout orders, the guest orders takeout (below).
    if (closed === "paymentRequested" || !takeout) return refuse(closed);
  } else if (!takeout) {
    // No table visit on this phone (none, an unknown one, or another kind), and no takeout here.
    return refuse(settings.dineInEnabled ? "noTable" : "orderingOff");
  }

  // ── Takeout ──
  // Adding to the pickup visit this phone already holds, while it is open: no name is asked again.
  if (session?.kind === "PICKUP" && session.status === "OPEN") return placeInto(session);

  const customer = readPickupCustomer(input.cart);
  if (!customer) return refuse("nameRequired");
  try {
    const result = await deps.placePickup({ restaurantId: restaurant.id, rates, lines, requestId, customer });
    if (result.ok) return { ok: true, orderNumber: result.value.order.number, startedVisit: result.value.order.sessionId };
    switch (result.error.type) {
      case "NAME_REQUIRED":
        return refuse("nameRequired");
      case "NAME_TOO_LONG":
      case "NAME_INVALID":
        return refuse("nameInvalid");
      case "PHONE_INVALID":
        return refuse("phoneInvalid");
      case "INVALID_REQUEST":
        return refuse("failed");
      default:
        return refuseLogged(result.error);
    }
  } catch (error) {
    console.error("placing a takeout order failed", error);
    return refuse("failed");
  }
}

/** A use-case refusal as what the cart shows. One no guest can cause (bad rates in the settings, ...) leaves a trace. */
function refuseLogged(error: OrderUseCaseError): Refusal {
  const problem = orderProblem(error);
  if (problem === "failed") console.error("placing a customer order was refused unexpectedly", error);
  return refuse(problem);
}
