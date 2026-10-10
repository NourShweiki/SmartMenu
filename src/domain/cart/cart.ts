import { isOrderable, type MenuCategory, type MenuItem, type MenuItemId } from "@/domain/menu/menu";
import {
  isGroupOrderable,
  priceWithOptions,
  validateSelection,
  type MenuOption,
  type OptionGroup,
  type OptionId,
} from "@/domain/menu/options";
import { calculateTotals, MAX_LINE_QUANTITY, MAX_ORDER_LINES, type OrderRates } from "@/domain/order/order";
import type { Fils } from "@/domain/shared/money";
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * The customer's cart: what they intend to order, before anything is stored. It holds ONLY ids and quantities.
 * Names and prices are never kept here: they are read from the live menu every time (so a price change shows
 * up immediately), and the server re-checks everything and prices the real order itself (placeOrder).
 */
export type CartLine = {
  /** Same item + same set of options = same line (quantities merge). */
  readonly key: string;
  readonly menuItemId: MenuItemId;
  /** Sorted, so the order the customer ticked them in does not matter. */
  readonly optionIds: readonly OptionId[];
  readonly quantity: number;
};
export type Cart = { readonly lines: readonly CartLine[] };
export const EMPTY_CART: Cart = { lines: [] };

export type CartError = { type: "INVALID_QUANTITY" } | { type: "QUANTITY_TOO_HIGH"; max: number } | { type: "CART_FULL"; max: number } | { type: "LINE_NOT_FOUND" };

const isQuantity = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1;

export function lineKey(menuItemId: string, optionIds: readonly string[]): string {
  return `${menuItemId}|${[...new Set(optionIds)].sort().join(",")}`;
}

export function addToCart(
  cart: Cart,
  input: { menuItemId: MenuItemId; optionIds: readonly OptionId[]; quantity: number },
): Result<Cart, CartError> {
  if (!isQuantity(input.quantity)) return err({ type: "INVALID_QUANTITY" });
  const optionIds = [...new Set(input.optionIds)].sort();
  const key = lineKey(input.menuItemId, optionIds);
  const existing = cart.lines.find((l) => l.key === key);

  if (existing) {
    const quantity = existing.quantity + input.quantity;
    if (quantity > MAX_LINE_QUANTITY) return err({ type: "QUANTITY_TOO_HIGH", max: MAX_LINE_QUANTITY });
    return ok({ lines: cart.lines.map((l) => (l.key === key ? { ...l, quantity } : l)) });
  }
  if (input.quantity > MAX_LINE_QUANTITY) return err({ type: "QUANTITY_TOO_HIGH", max: MAX_LINE_QUANTITY });
  if (cart.lines.length >= MAX_ORDER_LINES) return err({ type: "CART_FULL", max: MAX_ORDER_LINES });
  return ok({ lines: [...cart.lines, { key, menuItemId: input.menuItemId, optionIds, quantity: input.quantity }] });
}

/** Sets a line's quantity; 0 removes the line. */
export function setQuantity(cart: Cart, key: string, quantity: number): Result<Cart, CartError> {
  if (!cart.lines.some((l) => l.key === key)) return err({ type: "LINE_NOT_FOUND" });
  if (quantity === 0) return ok(removeLine(cart, key));
  if (!isQuantity(quantity)) return err({ type: "INVALID_QUANTITY" });
  if (quantity > MAX_LINE_QUANTITY) return err({ type: "QUANTITY_TOO_HIGH", max: MAX_LINE_QUANTITY });
  return ok({ lines: cart.lines.map((l) => (l.key === key ? { ...l, quantity } : l)) });
}

export const removeLine = (cart: Cart, key: string): Cart => ({ lines: cart.lines.filter((l) => l.key !== key) });

/** Number of items (sum of quantities), for the badge on the cart button. */
export const cartItemCount = (cart: Cart): number => cart.lines.reduce((sum, l) => sum + l.quantity, 0);

/**
 * Reads a cart saved in the browser (localStorage). Anything odd is dropped line by line, never thrown: the
 * browser's storage can hold anything (an old version, a hand edit), and a broken cart must not break the page.
 */
export function parseCart(json: unknown): Cart {
  const raw = typeof json === "object" && json !== null ? (json as { lines?: unknown }).lines : undefined;
  if (!Array.isArray(raw)) return EMPTY_CART;
  let cart = EMPTY_CART;
  for (const entry of raw) {
    const line = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    if (typeof line.menuItemId !== "string" || line.menuItemId === "" || !Array.isArray(line.optionIds)) continue;
    const optionIds = line.optionIds.filter((o): o is string => typeof o === "string" && o !== "");
    const added = addToCart(cart, { menuItemId: line.menuItemId as MenuItemId, optionIds: optionIds as OptionId[], quantity: line.quantity as number });
    if (added.ok) cart = added.value;
  }
  return cart;
}

// ─── Pricing preview (display only; the server prices the real order) ───────

/** What the menu says about one orderable thing, as the pricing needs it. */
export type CartCatalogEntry = {
  readonly item: MenuItem;
  readonly category: MenuCategory;
  readonly groups: readonly { readonly group: OptionGroup; readonly options: readonly MenuOption[] }[];
};

export type LineProblem =
  | "ITEM_UNAVAILABLE" // gone from the menu, hidden, or sold out since it was added
  | "OPTION_UNAVAILABLE" // a chosen option no longer exists
  | "SELECTION_INVALID"; // the choices no longer satisfy the item's option rules

export type PricedLine = {
  readonly key: string;
  readonly quantity: number;
  readonly menuItemId: MenuItemId;
  readonly item: MenuItem | null;
  readonly options: readonly MenuOption[];
  readonly unitPriceFils: Fils;
  readonly lineTotalFils: Fils;
  readonly problem: LineProblem | null;
};

export type PricedCart = {
  readonly lines: readonly PricedLine[];
  readonly subtotalFils: Fils;
  readonly serviceChargeFils: Fils;
  readonly taxFils: Fils;
  readonly totalFils: Fils;
  /** True when there is at least one line and every line can be ordered. */
  readonly canCheckout: boolean;
};

function priceLine(line: CartLine, catalog: ReadonlyMap<string, CartCatalogEntry>): PricedLine {
  const base = { key: line.key, quantity: line.quantity, menuItemId: line.menuItemId };
  const broken = (problem: LineProblem, item: MenuItem | null = null, options: readonly MenuOption[] = []): PricedLine => ({
    ...base,
    item,
    options,
    unitPriceFils: 0 as Fils,
    lineTotalFils: 0 as Fils,
    problem,
  });

  const entry = catalog.get(line.menuItemId);
  if (!entry || !isOrderable(entry.item, entry.category)) return broken("ITEM_UNAVAILABLE", entry?.item ?? null);
  // Same rule as the order: a required group with too few live options makes the item impossible to order.
  if (entry.groups.some(({ group, options }) => !isGroupOrderable(group, [...options]))) return broken("ITEM_UNAVAILABLE", entry.item);

  // Only live options of live groups are on offer (a deleted one is gone, even if the data still lists it).
  const offered = new Map(
    entry.groups.flatMap(({ group, options }) =>
      group.deletedAt ? [] : options.filter((o) => o.groupId === group.id && !o.deletedAt).map((o) => [o.id as string, o] as const),
    ),
  );
  if (line.optionIds.some((id) => !offered.has(id))) return broken("OPTION_UNAVAILABLE", entry.item);

  const picked: MenuOption[] = [];
  for (const { group, options } of entry.groups) {
    if (group.deletedAt) continue;
    const own = new Set(options.map((o) => o.id as string));
    const result = validateSelection(group, [...options], line.optionIds.filter((id) => own.has(id)));
    if (!result.ok) return broken("SELECTION_INVALID", entry.item);
    picked.push(...result.value);
  }
  const unit = priceWithOptions(entry.item.priceFils, picked);
  return { ...base, item: entry.item, options: picked, unitPriceFils: unit, lineTotalFils: (unit * line.quantity) as Fils, problem: null };
}

/**
 * Prices the cart against the live menu with the restaurant's current rates, using the same rules and the same
 * money functions as the real order (so the preview and the placed order agree to the fils). Lines that cannot
 * be ordered any more are kept (so the customer can see and remove them) but add nothing to the totals.
 */
export function priceCart(cart: Cart, catalog: ReadonlyMap<string, CartCatalogEntry>, rates: OrderRates): PricedCart {
  const lines = cart.lines.map((line) => priceLine(line, catalog));
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalFils, 0);
  return {
    lines,
    ...calculateTotals(subtotal, rates),
    canCheckout: lines.length > 0 && lines.every((l) => l.problem === null),
  };
}
