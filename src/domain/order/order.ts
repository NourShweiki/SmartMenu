import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Permission } from "@/domain/restaurant/role";
import { isOrderable, type MenuCategory, type MenuItem, type MenuItemId } from "@/domain/menu/menu";
import {
  isGroupOrderable,
  validateSelection,
  priceWithOptions,
  type MenuOption,
  type OptionGroup,
  type OptionId,
  type SelectionError,
} from "@/domain/menu/options";
import { MAX_PRICE_FILS, type Fils } from "@/domain/shared/money";
import { err, ok, type LocalizedText, type Result } from "@/domain/shared/result";

export type OrderId = string & { readonly __brand: "OrderId" };
export type OrderItemId = string & { readonly __brand: "OrderItemId" };
/** One visit at one table (several devices can share it). The table-session context is built later. */
export type TableSessionId = string & { readonly __brand: "TableSessionId" };

/** Spec §4. Cancellation is NOT modelled yet: its rules need Nour's decision first (data-model skill §8). */
export const ORDER_FLOW = ["NEW", "CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"] as const;
export type OrderStatus = (typeof ORDER_FLOW)[number];

/** What the customer picked, copied at order time so later menu edits never change a past order. */
export type OrderOptionSnapshot = {
  readonly optionId: OptionId;
  readonly groupName: LocalizedText;
  readonly name: LocalizedText;
  readonly priceDeltaFils: Fils;
};

export type OrderItem = {
  readonly id: OrderItemId;
  /** Reference only. Name and prices below are the snapshot. */
  readonly menuItemId: MenuItemId;
  readonly name: LocalizedText;
  readonly unitPriceFils: Fils;
  readonly options: readonly OrderOptionSnapshot[];
  readonly quantity: number;
  /** (unit price + picked options) x quantity. */
  readonly lineTotalFils: Fils;
};

export type Order = {
  readonly id: OrderId;
  readonly restaurantId: RestaurantId;
  readonly sessionId: TableSessionId;
  /** Human-friendly per-restaurant number for the kitchen (data-model skill §2). Never the primary key. */
  readonly number: number;
  readonly status: OrderStatus;
  readonly items: readonly OrderItem[];
  readonly subtotalFils: Fils;
  readonly serviceChargeFils: Fils;
  readonly taxFils: Fils;
  readonly totalFils: Fils;
  /** Rates in force when the order was placed (basis points). Later settings changes don't touch this order. */
  readonly taxRateBp: number;
  readonly serviceChargeBp: number;
  readonly createdAt: Date;
  readonly statusChangedAt: Date;
};

export type OrderError =
  | { type: "EMPTY_ORDER" }
  | { type: "TOO_MANY_LINES"; max: number }
  | { type: "INVALID_QUANTITY"; menuItemId: string }
  | { type: "INVALID_NUMBER" }
  | { type: "INVALID_RATES" }
  | { type: "ORDER_TOO_LARGE" }
  | { type: "ITEM_NOT_ORDERABLE"; menuItemId: string }
  | { type: "WRONG_RESTAURANT" }
  | { type: "SELECTION"; menuItemId: string; reason: SelectionError }
  | { type: "INVALID_TRANSITION"; from: OrderStatus; to: OrderStatus };

/** Ids are injected so the domain stays pure and testable (same shape as the menu context's). */
export type OrderDeps = { newId: () => string };

export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

/** One cart line as the customer submitted it, plus the live menu data needed to check it. */
export type OrderLineRequest = {
  readonly item: MenuItem;
  readonly category: MenuCategory;
  /** The option groups attached to this item, each with its options. */
  readonly groups: readonly { readonly group: OptionGroup; readonly options: readonly MenuOption[] }[];
  readonly selectedOptionIds: readonly string[];
  readonly quantity: number;
};

export type OrderRates = { readonly taxRateBp: number; readonly serviceChargeBp: number };

/** Basis points, whole numbers 0..10000 (same rule as restaurant settings). */
const isValidBp = (n: number) => Number.isInteger(n) && n >= 0 && n <= 10_000;

// ─── Money ──────────────────────────────────────────────────────────────

/** Round half up to whole fils. BigInt: subtotal x basis points can exceed 2^53 for huge orders. */
function percentOfBp(amount: number, bp: number): number {
  return Number((BigInt(amount) * BigInt(bp) + 5_000n) / 10_000n);
}

/**
 * Service charge is on the subtotal; tax is on subtotal + service charge. One round-half-up step each
 * (data-model skill §3). ASSUMPTION to confirm with the founders: tax-on-service, as many Jordanian
 * restaurants bill it. Changing it only touches this function.
 */
export function calculateTotals(subtotalFils: number, rates: OrderRates) {
  const serviceChargeFils = percentOfBp(subtotalFils, rates.serviceChargeBp);
  const taxFils = percentOfBp(subtotalFils + serviceChargeFils, rates.taxRateBp);
  return {
    subtotalFils: subtotalFils as Fils,
    serviceChargeFils: serviceChargeFils as Fils,
    taxFils: taxFils as Fils,
    totalFils: (subtotalFils + serviceChargeFils + taxFils) as Fils,
  };
}

// ─── Creating an order ──────────────────────────────────────────────────

function buildLine(restaurantId: RestaurantId, line: OrderLineRequest, deps: OrderDeps): Result<OrderItem, OrderError> {
  const menuItemId = line.item.id;
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
    return err({ type: "INVALID_QUANTITY", menuItemId });
  }
  const sameRestaurant =
    line.item.restaurantId === restaurantId &&
    line.category.restaurantId === restaurantId &&
    line.groups.every(
      ({ group, options }) => group.restaurantId === restaurantId && options.every((o) => o.restaurantId === restaurantId),
    );
  if (!sameRestaurant) return err({ type: "WRONG_RESTAURANT" });
  if (line.item.categoryId !== line.category.id || !isOrderable(line.item, line.category)) {
    return err({ type: "ITEM_NOT_ORDERABLE", menuItemId });
  }

  // Live groups only, each once (a group listed twice must not be charged twice). A deleted group is
  // detached from the item, so it asks nothing of the customer. Each group keeps just its own live options.
  const seen = new Set<string>();
  const live: { group: OptionGroup; options: MenuOption[] }[] = [];
  for (const { group, options } of line.groups) {
    if (group.deletedAt || seen.has(group.id)) continue;
    seen.add(group.id);
    live.push({ group, options: options.filter((o) => o.groupId === group.id && !o.deletedAt) });
  }
  // A required group with too few live options makes the item impossible to order.
  if (live.some(({ group, options }) => !isGroupOrderable(group, options))) {
    return err({ type: "ITEM_NOT_ORDERABLE", menuItemId });
  }

  // Every picked option must belong to one of those groups.
  const offered = new Set(live.flatMap(({ options }) => options.map((o) => o.id as string)));
  const unknown = line.selectedOptionIds.find((id) => !offered.has(id));
  if (unknown !== undefined) {
    return err({ type: "SELECTION", menuItemId, reason: { type: "UNKNOWN_OPTION", optionId: unknown } });
  }

  const picked: OrderOptionSnapshot[] = [];
  const pickedOptions: MenuOption[] = [];
  for (const { group, options } of live) {
    const own = new Set(options.map((o) => o.id as string));
    const result = validateSelection(group, options, line.selectedOptionIds.filter((id) => own.has(id)));
    if (!result.ok) return err({ type: "SELECTION", menuItemId, reason: result.error });
    for (const option of result.value) {
      pickedOptions.push(option);
      // Copies, so a later edit to the menu objects can never reach into a placed order.
      picked.push({
        optionId: option.id,
        groupName: { ...group.name },
        name: { ...option.name },
        priceDeltaFils: option.priceDeltaFils,
      });
    }
  }

  const unit = priceWithOptions(line.item.priceFils, pickedOptions);
  return ok({
    id: deps.newId() as OrderItemId,
    menuItemId,
    name: { ...line.item.name },
    unitPriceFils: line.item.priceFils,
    options: picked,
    quantity: line.quantity,
    lineTotalFils: (unit * line.quantity) as Fils,
  });
}

export type NewOrderInput = {
  readonly restaurantId: RestaurantId;
  readonly sessionId: TableSessionId;
  /** Next per-restaurant order number, handed out by the repository. */
  readonly number: number;
  readonly lines: readonly OrderLineRequest[];
  readonly rates: OrderRates;
};

/**
 * Builds a NEW order from a cart. Ordering more items after the first order is confirmed is just another
 * call for the same session: the addition starts again at NEW (spec §4), it never reopens a confirmed order.
 */
export function createOrder(input: NewOrderInput, deps: OrderDeps, now: Date): Result<Order, OrderError> {
  if (!Number.isSafeInteger(input.number) || input.number < 1) return err({ type: "INVALID_NUMBER" });
  if (!isValidBp(input.rates.taxRateBp) || !isValidBp(input.rates.serviceChargeBp)) return err({ type: "INVALID_RATES" });
  if (input.lines.length === 0) return err({ type: "EMPTY_ORDER" });
  if (input.lines.length > MAX_ORDER_LINES) return err({ type: "TOO_MANY_LINES", max: MAX_ORDER_LINES });

  const items: OrderItem[] = [];
  for (const line of input.lines) {
    const built = buildLine(input.restaurantId, line, deps);
    if (!built.ok) return built;
    items.push(built.value);
  }
  const subtotal = items.reduce((sum, i) => sum + i.lineTotalFils, 0);
  const totals = calculateTotals(subtotal, input.rates);
  // Same sanity cap as a single price, so a stored total always passes toFils later.
  if (totals.totalFils > MAX_PRICE_FILS) return err({ type: "ORDER_TOO_LARGE" });
  return ok({
    id: deps.newId() as OrderId,
    restaurantId: input.restaurantId,
    sessionId: input.sessionId,
    number: input.number,
    status: "NEW",
    items,
    ...totals,
    taxRateBp: input.rates.taxRateBp,
    serviceChargeBp: input.rates.serviceChargeBp,
    createdAt: now,
    statusChangedAt: now,
  });
}

// ─── Status flow ────────────────────────────────────────────────────────

/** The only status an order may move to next, or null once COMPLETED. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  return ORDER_FLOW[ORDER_FLOW.indexOf(status) + 1] ?? null;
}

/** One step forward at a time, no skipping and no going back (spec §4). */
export function moveOrderTo(order: Order, to: OrderStatus, now: Date): Result<Order, OrderError> {
  if (nextStatus(order.status) !== to) return err({ type: "INVALID_TRANSITION", from: order.status, to });
  return ok({ ...order, status: to, statusChangedAt: now });
}

/** On READY the session's devices get a push notification (spec §4); the use case decides when to send it. */
export const shouldNotifyCustomer = (status: OrderStatus): boolean => status === "READY";

/**
 * Who may take an order to this status (decided 2026-10-10): the final COMPLETED step is the cashier's,
 * after the customer has paid (`payments:close`); every earlier step belongs to the floor (`orders:confirm`).
 * Owner and manager hold both. The database enforces the same split (migration cashier_completes_orders).
 */
export function permissionToMoveTo(status: OrderStatus): Extract<Permission, "orders:confirm" | "payments:close"> {
  return status === "COMPLETED" ? "payments:close" : "orders:confirm";
}
