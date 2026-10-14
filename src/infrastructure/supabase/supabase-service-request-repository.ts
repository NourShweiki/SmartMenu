import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceRequestRepository, WaitingServiceRequest } from "@/application/ports/service-request-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { SERVICE_KINDS, SERVICE_REQUEST_STATUSES, type ServiceRequest, type ServiceRequestId } from "@/domain/service-request/service-request";
import { effectiveSessionStatus, type TableId, type TableSessionId } from "@/domain/table-session/table-session";
import { REFUSED } from "./postgres-errors";
import { UUID } from "./supabase-options-repository";

/** A `service_requests` row, with its table's label and its visit's status (embedded through the composite foreign keys). */
export type ServiceRequestRow = {
  id: string;
  restaurant_id: string;
  session_id: string;
  table_id: string;
  kind: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  restaurant_tables?: { label: string } | null;
  table_sessions?: { status: string; started_at: string } | null;
};

const REQUEST_COLUMNS = "id, restaurant_id, session_id, table_id, kind, status, created_at, resolved_at";
const WAITING_COLUMNS = `${REQUEST_COLUMNS}, restaurant_tables(label), table_sessions(status, started_at)`;

/** Null when the row is not a request this app understands (an unknown kind or status, or a bad date). */
export function toServiceRequest(row: ServiceRequestRow): ServiceRequest | null {
  const kind = SERVICE_KINDS.find((k) => k === row.kind);
  const status = SERVICE_REQUEST_STATUSES.find((s) => s === row.status);
  const createdAt = new Date(row.created_at);
  const resolvedAt = row.resolved_at ? new Date(row.resolved_at) : null;
  if (!kind || !status || Number.isNaN(createdAt.getTime()) || (resolvedAt && Number.isNaN(resolvedAt.getTime()))) return null;
  return {
    id: row.id as ServiceRequestId,
    restaurantId: row.restaurant_id as RestaurantId,
    sessionId: row.session_id as TableSessionId,
    tableId: row.table_id as TableId,
    kind,
    status,
    createdAt,
    resolvedAt,
  };
}

/**
 * A waiting request for the waiter's list, or null when it should not be shown: it is not understood, its table or
 * visit did not come with it, or its visit is closed or past its 2 hours (the domain's `effectiveSessionStatus`: an
 * expired visit is closed lazily, so the stored request still says OPEN while nobody is waiting any more).
 */
export function toWaitingRequest(row: ServiceRequestRow, now: Date): WaitingServiceRequest | null {
  const request = toServiceRequest(row);
  if (!request || request.status !== "OPEN" || !row.restaurant_tables || !row.table_sessions) return null;
  const startedAt = new Date(row.table_sessions.started_at);
  if (Number.isNaN(startedAt.getTime())) return null;
  const status = row.table_sessions.status;
  if (status !== "OPEN" && status !== "PAYMENT_REQUESTED" && status !== "CLOSED") return null;
  if (effectiveSessionStatus({ status, startedAt }, now) === "CLOSED") return null;
  return { request, tableLabel: row.restaurant_tables.label };
}

/**
 * Staff side of service requests. `db` is the signed-in staff member's client, so RLS applies: owner, manager and
 * waiter of the restaurant read and resolve its requests; the cashier and everybody else get nothing.
 */
export class SupabaseServiceRequestRepository implements ServiceRequestRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listWaiting(restaurantId: RestaurantId, now: Date): Promise<WaitingServiceRequest[]> {
    const { data, error } = await this.db
      .from("service_requests")
      .select(WAITING_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("status", "OPEN")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`list waiting service requests failed: ${error.message}`);
    return ((data ?? []) as unknown as ServiceRequestRow[]).flatMap((row) => toWaitingRequest(row, now) ?? []);
  }

  async findById(restaurantId: RestaurantId, id: ServiceRequestId): Promise<ServiceRequest | null> {
    if (!UUID.test(id)) return null; // anything else cannot be a request (and would be a database error)
    const { data, error } = await this.db.from("service_requests").select(REQUEST_COLUMNS).eq("restaurant_id", restaurantId).eq("id", id).maybeSingle();
    if (error) throw new Error(`read service request failed: ${error.message}`);
    return data ? toServiceRequest(data as unknown as ServiceRequestRow) : null;
  }

  async markDone(restaurantId: RestaurantId, id: ServiceRequestId): Promise<boolean> {
    if (!UUID.test(id)) return false;
    // `.eq("status", "OPEN")` makes it conditional: if someone else resolved it first, zero rows match.
    // Only `status` is sent: it is the only column staff may change, and the trigger stamps `resolved_at`.
    const { data, error } = await this.db
      .from("service_requests")
      .update({ status: "DONE" })
      .eq("restaurant_id", restaurantId)
      .eq("id", id)
      .eq("status", "OPEN")
      .select("id");
    if (error) {
      if (REFUSED.has(error.code)) return false; // the database refused this user / this move
      throw new Error(`resolve service request failed: ${error.message}`);
    }
    return (data?.length ?? 0) === 1;
  }
}
