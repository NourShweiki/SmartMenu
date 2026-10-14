import type { AssistantTurn } from "@/application/ports/ordering-assistant";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import type { AskOrderingAssistantError, AskOrderingAssistantInput, AskOrderingAssistantOutput } from "@/application/use-cases/ask-ordering-assistant";
import type { RejectionReason } from "@/domain/cart/assistant-proposal";
import { parseCart, type Cart } from "@/domain/cart/cart";
import type { Result } from "@/domain/shared/result";
import type { RateLimiter } from "./rate-limit";

/** Why the assistant did not answer, as the chat shows it (one translated message each). */
export type AssistantProblem =
  | "notAvailable" // no AI key on this server: the chat box should not even be offered
  | "emptyMessage"
  | "invalidRequest" // a request that is not what the chat box sends
  | "tooMany" // this device (or the restaurant) asked too often; try again in a few minutes
  | "failed"; // the AI service failed or answered nonsense

export type AssistantOutcome =
  | {
      ok: true;
      /** The assistant's words; empty when none of its suggestions could be added (its text would not be true). */
      message: string;
      /** The customer's cart with the accepted suggestions added: the browser keeps it as its cart. */
      cart: Cart;
      /** How many lines were added (not units). */
      added: number;
      /** Why each suggestion that could not be ordered right now was left out. */
      rejected: readonly RejectionReason[];
    }
  | { ok: false; problem: AssistantProblem };

/** A chat longer than this is not what the chat box sends (the use case cuts it further): refused before any work. */
export const MAX_REQUEST_TURNS = 60;

/** Strict, like the order's cart: one odd turn refuses the whole request (null). Length limits belong to the use case. */
export function readHistory(history: unknown): AssistantTurn[] | null {
  if (!Array.isArray(history) || history.length > MAX_REQUEST_TURNS) return null;
  const turns: AssistantTurn[] = [];
  for (const entry of history) {
    const turn = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    if ((turn.role !== "customer" && turn.role !== "assistant") || typeof turn.text !== "string") return null;
    turns.push({ role: turn.role, text: turn.text });
  }
  return turns;
}

type Deps = {
  ask: (input: AskOrderingAssistantInput) => Promise<Result<AskOrderingAssistantOutput, AskOrderingAssistantError>>;
  /** Per device. */
  deviceLimit: RateLimiter;
  /** Per restaurant: bounds the bill even when a visitor changes addresses. */
  restaurantLimit: RateLimiter;
};

const PROBLEM: Record<AskOrderingAssistantError["type"], AssistantProblem> = {
  NOT_CONFIGURED: "notAvailable",
  EMPTY_MESSAGE: "emptyMessage",
  SERVICE_FAILED: "failed",
};

/**
 * The chat box's "send": reads what the browser sent, applies the rate limits, asks the use case and shapes the answer.
 * The restaurant comes from the host (the caller), the rates from its settings; nothing tenant-related is read from
 * the browser. Limits are checked before anything that costs money, and only for requests that are well-formed.
 */
export async function askAssistant(
  deps: Deps,
  input: { restaurant: PublicRestaurant; history: unknown; cart: unknown; clientHash: string | null },
): Promise<AssistantOutcome> {
  const history = readHistory(input.history);
  if (!history) return { ok: false, problem: "invalidRequest" };

  // A device we cannot tell apart (no usable address: local development, or a proxy that sends none) gets NO device
  // limit: putting all of them in one shared bucket would let a few visitors lock everybody else out. The restaurant
  // limit still bounds the cost.
  if ((input.clientHash !== null && !deps.deviceLimit.hit(input.clientHash)) || !deps.restaurantLimit.hit(input.restaurant.id)) {
    return { ok: false, problem: "tooMany" };
  }

  const { settings } = input.restaurant;
  const result = await deps.ask({
    restaurant: { id: input.restaurant.id, slug: input.restaurant.slug },
    rates: { taxRateBp: settings.taxRateBp, serviceChargeBp: settings.serviceChargeBp },
    history,
    cart: parseCart(input.cart),
  });
  if (!result.ok) return { ok: false, problem: PROBLEM[result.error.type] };
  const { message, cart, added, rejected } = result.value;
  // When every suggested line was refused, the assistant's own words ("Added 2 kebabs") would be untrue: send none,
  // and the chat shows only the app's notes about what could not be added.
  const nothingAdded = added.length === 0 && rejected.length > 0;
  return { ok: true, message: nothingAdded ? "" : message, cart, added: added.length, rejected: rejected.map((r) => r.reason) };
}
