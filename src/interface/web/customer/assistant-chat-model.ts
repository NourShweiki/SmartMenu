import type { AssistantTurn } from "@/application/ports/ordering-assistant";
import type { RejectionReason } from "@/domain/cart/assistant-proposal";

/** What the chat box shows. A "note" is the app talking (what was added, what could not be): never sent to the AI. */
export type ChatEntry = { readonly role: "customer" | "assistant" | "note"; readonly text: string };

/** The longest chat the browser sends; the server cuts it further, this just keeps the request small. */
export const MAX_CLIENT_TURNS = 20;
export const MAX_MESSAGE_CHARS = 500;

/** The chat as the server wants it: the customer's and the assistant's turns only, the most recent ones. */
export function toHistory(entries: readonly ChatEntry[]): AssistantTurn[] {
  return entries
    .filter((e): e is ChatEntry & { role: AssistantTurn["role"] } => e.role !== "note")
    .map((e) => ({ role: e.role, text: e.text }))
    .slice(-MAX_CLIENT_TURNS);
}

/** Each reason once, in the order first seen (three unknown items are one sentence, not three). */
export const distinctReasons = (reasons: readonly RejectionReason[]): RejectionReason[] => [...new Set(reasons)];
