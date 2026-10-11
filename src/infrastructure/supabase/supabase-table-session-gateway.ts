import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicOrder, PublicSession, TableSessionGateway } from "@/application/ports/table-session-gateway";
import { ORDER_STATUSES } from "@/domain/order/order";
import type { Fils } from "@/domain/shared/money";
import { SESSION_STATUSES, type SessionStatus, type TableSessionId } from "@/domain/table-session/table-session";

/**
 * What public.join_table_session / get_public_session return (jsonb). Read defensively: anything that is not the
 * expected shape means "no session", never an error on the public page.
 */
export function toPublicSession(json: unknown): PublicSession | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const status = SESSION_STATUSES.find((s) => s === o.status) as SessionStatus | undefined;
  if (typeof o.session_id !== "string" || o.session_id === "" || !status) return null;
  const sessionId = o.session_id as TableSessionId;
  // `kind` is missing in what join_table_session returns (a scan is always a table) and in older databases: TABLE.
  if (o.kind === "PICKUP") return typeof o.customer_name === "string" && o.customer_name !== "" ? { sessionId, kind: "PICKUP", customerName: o.customer_name, status } : null;
  return typeof o.table_label === "string" ? { sessionId, kind: "TABLE", tableLabel: o.table_label, status } : null;
}

/**
 * What public.get_public_session_orders returns (a jsonb array). Read as defensively as the session above: an
 * entry that is not an order as expected is left out, never an error on the guests' page.
 */
export function toPublicOrders(json: unknown): PublicOrder[] {
  if (!Array.isArray(json)) return [];
  const orders: PublicOrder[] = [];
  for (const entry of json) {
    if (typeof entry !== "object" || entry === null) continue;
    const o = entry as Record<string, unknown>;
    const status = ORDER_STATUSES.find((s) => s === o.status);
    const placedAt = typeof o.placed_at === "string" ? new Date(o.placed_at) : null;
    if (typeof o.number !== "number" || !status || !placedAt || Number.isNaN(placedAt.getTime()) || typeof o.total_fils !== "number") continue;
    const lines = (Array.isArray(o.items) ? o.items : []).flatMap((item) => {
      const i = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
      return typeof i.name_en === "string" && typeof i.name_ar === "string" && typeof i.quantity === "number"
        ? [{ name: { en: i.name_en, ar: i.name_ar }, quantity: i.quantity }]
        : [];
    });
    orders.push({ number: o.number, status, placedAt, totalFils: o.total_fils as Fils, lines });
  }
  return orders;
}

/** Customers have no accounts: every call uses the public (anon) client and the narrow public functions. */
export class SupabaseTableSessionGateway implements TableSessionGateway {
  constructor(private readonly db: SupabaseClient) {}

  async join(slug: string, token: string): Promise<PublicSession | null> {
    const { data, error } = await this.db.rpc("join_table_session", { p_slug: slug, p_token: token });
    if (error) throw new Error(`join_table_session failed: ${error.message}`);
    return toPublicSession(data);
  }

  async find(slug: string, sessionId: string): Promise<PublicSession | null> {
    const { data, error } = await this.db.rpc("get_public_session", { p_slug: slug, p_session_id: sessionId });
    if (error) throw new Error(`get_public_session failed: ${error.message}`);
    return toPublicSession(data);
  }

  async orders(slug: string, sessionId: string): Promise<PublicOrder[]> {
    const { data, error } = await this.db.rpc("get_public_session_orders", { p_slug: slug, p_session_id: sessionId });
    if (error) throw new Error(`get_public_session_orders failed: ${error.message}`);
    return toPublicOrders(data);
  }
}
