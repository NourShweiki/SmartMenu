import type { OrderStatus } from "@/domain/order/order";
import type { Fils } from "@/domain/shared/money";
import type { LocalizedText } from "@/domain/shared/result";
import type { SessionStatus, TableSessionId } from "@/domain/table-session/table-session";

/** What a customer's device learns when it scans a table's QR code. Nothing else about the table or restaurant. */
export type PublicSession = { sessionId: TableSessionId; tableLabel: string; status: SessionStatus };

/**
 * One order of a table visit, as far as the guests at that table may see it: its number, how far it has got, when
 * it was placed, what was ordered and its total. No ids, no reason or person of a cancellation.
 */
export type PublicOrder = {
  readonly number: number;
  readonly status: OrderStatus;
  readonly placedAt: Date;
  readonly totalFils: Fils;
  readonly lines: readonly { readonly name: LocalizedText; readonly quantity: number }[];
};

/**
 * Customers have no accounts, so this goes through narrow public database functions (no table access).
 * The restaurant is identified by its slug, which the caller took from the host, never from the request body.
 */
export interface TableSessionGateway {
  /** Joins the table's live session, starting one if there is none. Null when the code is not valid. */
  join(slug: string, token: string): Promise<PublicSession | null>;
  /** Looks up a session this device already holds. Null when it does not belong to this restaurant. */
  find(slug: string, sessionId: string): Promise<PublicSession | null>;
  /** The orders of a session this device holds, oldest first. Empty when it is unknown or not this restaurant's. */
  orders(slug: string, sessionId: string): Promise<PublicOrder[]>;
}
