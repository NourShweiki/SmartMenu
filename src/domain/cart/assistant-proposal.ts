import type { MenuItemId } from "@/domain/menu/menu";
import type { OptionId } from "@/domain/menu/options";
import type { OrderRates } from "@/domain/order/order";
import { addToCart, EMPTY_CART, priceCart, type Cart, type CartCatalogEntry, type LineProblem } from "./cart";

/**
 * What the AI ordering assistant SUGGESTS: ids and a quantity per line, nothing else. It is untrusted input, like a
 * form a stranger filled in. Names and prices are never taken from it; they are read from the live menu afterwards,
 * so the assistant cannot invent an item, a price or an availability.
 */
export type ProposedLine = {
  readonly menuItemId: string;
  readonly optionIds: readonly string[];
  readonly quantity: number;
};

export type RejectionReason =
  | "UNKNOWN_ITEM" // the id is not on this restaurant's live menu at all (invented, hidden or deleted)
  | LineProblem // sold out, option gone, or the choices break the item's option rules
  | "INVALID_QUANTITY"
  | "QUANTITY_TOO_HIGH"
  | "CART_FULL";

export type RejectedLine = { readonly proposed: ProposedLine; readonly reason: RejectionReason };

export type GroundedProposal = {
  /** The customer's cart with every accepted line added. It still goes through the normal confirm step. */
  readonly cart: Cart;
  readonly accepted: readonly ProposedLine[];
  readonly rejected: readonly RejectedLine[];
};

const asStrings = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x !== "") ? (v as string[]) : null;

/**
 * Checks the assistant's suggestion line by line against the live menu, with the same rules as the cart and the
 * real order. A line is accepted only when it could be ordered right now; every other line is returned as rejected
 * with the reason, so the assistant can tell the customer instead of guessing. One bad line never blocks the rest.
 */
export function groundProposal(
  proposed: readonly ProposedLine[],
  catalog: ReadonlyMap<string, CartCatalogEntry>,
  rates: OrderRates,
  existing: Cart = EMPTY_CART,
): GroundedProposal {
  let cart = existing;
  const accepted: ProposedLine[] = [];
  const rejected: RejectedLine[] = [];

  for (const line of proposed) {
    const optionIds = asStrings(line.optionIds);
    if (typeof line.menuItemId !== "string" || optionIds === null || !catalog.has(line.menuItemId)) {
      rejected.push({ proposed: line, reason: "UNKNOWN_ITEM" });
      continue;
    }
    const add = addToCart(EMPTY_CART, { menuItemId: line.menuItemId as MenuItemId, optionIds: optionIds as OptionId[], quantity: line.quantity });
    if (!add.ok) {
      rejected.push({ proposed: line, reason: add.error.type === "INVALID_QUANTITY" ? "INVALID_QUANTITY" : "QUANTITY_TOO_HIGH" });
      continue;
    }
    // Could this exact line be ordered right now? (sold out, deleted option, option rules.)
    const problem = priceCart(add.value, catalog, rates).lines[0]?.problem;
    if (problem) {
      rejected.push({ proposed: line, reason: problem });
      continue;
    }
    const merged = addToCart(cart, { menuItemId: line.menuItemId as MenuItemId, optionIds: optionIds as OptionId[], quantity: line.quantity });
    if (!merged.ok) {
      rejected.push({ proposed: line, reason: merged.error.type === "CART_FULL" ? "CART_FULL" : "QUANTITY_TOO_HIGH" });
      continue;
    }
    cart = merged.value;
    accepted.push(line);
  }
  return { cart, accepted, rejected };
}
