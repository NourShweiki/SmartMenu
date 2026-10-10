import type { SessionStatus, TableSessionId } from "@/domain/table-session/table-session";

/** What a customer's device learns when it scans a table's QR code. Nothing else about the table or restaurant. */
export type PublicSession = { sessionId: TableSessionId; tableLabel: string; status: SessionStatus };

/**
 * Customers have no accounts, so this goes through narrow public database functions (no table access).
 * The restaurant is identified by its slug, which the caller took from the host, never from the request body.
 */
export interface TableSessionGateway {
  /** Joins the table's live session, starting one if there is none. Null when the code is not valid. */
  join(slug: string, token: string): Promise<PublicSession | null>;
  /** Looks up a session this device already holds. Null when it does not belong to this restaurant. */
  find(slug: string, sessionId: string): Promise<PublicSession | null>;
}
