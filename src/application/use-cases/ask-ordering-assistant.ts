import type { AssistantTurn, OrderingAssistant } from "@/application/ports/ordering-assistant";
import type { PublicMenuRepository } from "@/application/ports/public-menu-repository";
import { groundProposal, type ProposedLine, type RejectedLine } from "@/domain/cart/assistant-proposal";
import type { Cart, CartCatalogEntry } from "@/domain/cart/cart";
import type { OrderRates } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import { makeGetPublicMenu } from "./get-public-menu";

/** Keeps the cost and the attack surface of one call bounded: the chat is cut to the last turns, each turn to a length. */
export const MAX_HISTORY_TURNS = 20;
export const MAX_TURN_CHARS = 1000;

export type AskOrderingAssistantInput = {
  /** From the host, never from the request body. */
  readonly restaurant: { id: RestaurantId; slug: string };
  /** The restaurant's rates for how this customer orders (takeout has no service charge). */
  readonly rates: OrderRates;
  /** The chat so far; the last turn must be the customer's new message. */
  readonly history: readonly AssistantTurn[];
  /** The customer's cart now. Accepted suggestions are added to it. */
  readonly cart: Cart;
};

export type AskOrderingAssistantOutput = {
  readonly message: string;
  /** The cart with every accepted line added. Still only a cart: the customer confirms and places the order. */
  readonly cart: Cart;
  readonly added: readonly ProposedLine[];
  /** Suggestions that could not be ordered right now, with why, so the screen can say so. */
  readonly rejected: readonly RejectedLine[];
};

export type AskOrderingAssistantError =
  | { type: "NOT_CONFIGURED" }
  | { type: "EMPTY_MESSAGE" }
  | { type: "SERVICE_FAILED" };

/** Trims and cuts the chat; the last kept turn must be the customer's, otherwise there is nothing to answer. */
function cleanHistory(history: readonly AssistantTurn[]): AssistantTurn[] {
  const turns = history
    .filter((t) => (t.role === "customer" || t.role === "assistant") && typeof t.text === "string")
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TURN_CHARS) }))
    .filter((t) => t.text !== "");
  return turns.slice(-MAX_HISTORY_TURNS);
}

/**
 * Asks the AI ordering assistant about the customer's message, then CHECKS what it suggests against the live menu
 * (groundProposal). The assistant sees only what customers see; nothing it says about names or prices is used, and
 * a line that cannot be ordered right now never reaches the cart.
 */
export function makeAskOrderingAssistant(deps: { menu: PublicMenuRepository; assistant: OrderingAssistant }) {
  const getMenu = makeGetPublicMenu({ menu: deps.menu });

  return async (input: AskOrderingAssistantInput): Promise<Result<AskOrderingAssistantOutput, AskOrderingAssistantError>> => {
    if (!deps.assistant.isAvailable()) return err({ type: "NOT_CONFIGURED" });
    const history = cleanHistory(input.history);
    if (history[history.length - 1]?.role !== "customer") return err({ type: "EMPTY_MESSAGE" });

    const { sections } = await getMenu(input.restaurant);
    const answer = await deps.assistant.reply({ menu: sections, history });
    if (!answer.ok) return err({ type: "SERVICE_FAILED" });

    const catalog = new Map<string, CartCatalogEntry>(
      sections.flatMap(({ category, items }) => items.map(({ item, groups }) => [item.id as string, { item, category, groups }] as const)),
    );
    const grounded = groundProposal(answer.value.proposed, catalog, input.rates, input.cart);
    return ok({ message: answer.value.message, cart: grounded.cart, added: grounded.accepted, rejected: grounded.rejected });
  };
}
