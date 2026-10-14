import type { ProposedLine } from "@/domain/cart/assistant-proposal";
import type { Result } from "@/domain/shared/result";
import type { PublicMenuSection } from "./public-menu-repository";

/** One message of the chat, as the customer's page keeps it. */
export type AssistantTurn = { readonly role: "customer" | "assistant"; readonly text: string };

export type AssistantAnswer = {
  /** What to say to the customer, in the language they wrote in. Plain text. */
  readonly message: string;
  /** Lines the assistant suggests adding to the cart. UNTRUSTED: always run through `groundProposal`. */
  readonly proposed: readonly ProposedLine[];
};

export type OrderingAssistantError =
  /** No AI service is set up on this server (no key). */
  | { type: "NOT_CONFIGURED" }
  /** The service could not be reached, refused, or failed. */
  | { type: "SERVICE_FAILED" }
  /** The service answered, but not in the shape we asked for. */
  | { type: "BAD_ANSWER" };

/**
 * The AI ordering assistant: reads the customer's chat and the restaurant's LIVE menu, answers questions about the
 * menu and suggests cart lines. Its output is a suggestion only: names and prices never come from it, and every
 * suggested line is checked against the menu (`groundProposal`) before it can reach a cart.
 */
export interface OrderingAssistant {
  /** Whether the assistant can be asked at all (a key is configured). Cheap: no call is made. */
  isAvailable(): boolean;
  reply(input: { menu: readonly PublicMenuSection[]; history: readonly AssistantTurn[] }): Promise<Result<AssistantAnswer, OrderingAssistantError>>;
}
