import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateServiceRequestOutcome, PublicServiceRequest, ServiceRequestGateway } from "@/application/ports/service-request-gateway";
import { SERVICE_KINDS, SERVICE_REQUEST_STATUSES } from "@/domain/service-request/service-request";
import { err, ok } from "@/domain/shared/result";

const REFUSALS = ["INVALID_KIND", "NOT_A_TABLE_VISIT", "SESSION_ENDED", "ALREADY_REQUESTED"] as const;

/**
 * What public.create_service_request returns (jsonb): `{ ok: true, id, kind }`, `{ ok: false, error }`, or NULL when the
 * visit is not this restaurant's. Read defensively: anything that is not one of those is "visit not found", never a
 * crash on the guest's page and never a request that looks made when it was not.
 */
export function toCreateOutcome(json: unknown): CreateServiceRequestOutcome {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return err({ type: "SESSION_NOT_FOUND" });
  const o = json as Record<string, unknown>;
  if (o.ok === true) {
    const kind = SERVICE_KINDS.find((k) => k === o.kind);
    return typeof o.id === "string" && o.id !== "" && kind ? ok({ id: o.id, kind }) : err({ type: "SESSION_NOT_FOUND" });
  }
  const refusal = REFUSALS.find((r) => r === o.error);
  return refusal ? err({ type: refusal }) : err({ type: "SESSION_NOT_FOUND" });
}

/** What public.get_public_service_requests returns (a jsonb array). An entry that is not a request as expected is left out. */
export function toPublicServiceRequests(json: unknown): PublicServiceRequest[] {
  if (!Array.isArray(json)) return [];
  const requests: PublicServiceRequest[] = [];
  for (const entry of json) {
    if (typeof entry !== "object" || entry === null) continue;
    const o = entry as Record<string, unknown>;
    const kind = SERVICE_KINDS.find((k) => k === o.kind);
    const status = SERVICE_REQUEST_STATUSES.find((s) => s === o.status);
    const createdAt = typeof o.created_at === "string" ? new Date(o.created_at) : null;
    if (typeof o.id !== "string" || !kind || !status || !createdAt || Number.isNaN(createdAt.getTime())) continue;
    requests.push({ id: o.id, kind, status, createdAt });
  }
  return requests;
}

/** Customers have no accounts: every call uses the public (anon) client and the narrow public functions. */
export class SupabaseServiceRequestGateway implements ServiceRequestGateway {
  constructor(private readonly db: SupabaseClient) {}

  async create(slug: string, sessionId: string, kind: string): Promise<CreateServiceRequestOutcome> {
    const { data, error } = await this.db.rpc("create_service_request", { p_slug: slug, p_session_id: sessionId, p_kind: kind });
    if (error) {
      // A session id that is not a uuid cannot be any visit of ours: the same answer as an unknown visit.
      if (error.code === "22P02") return err({ type: "SESSION_NOT_FOUND" });
      throw new Error(`create_service_request failed: ${error.message}`);
    }
    return toCreateOutcome(data);
  }

  async forSession(slug: string, sessionId: string): Promise<PublicServiceRequest[]> {
    const { data, error } = await this.db.rpc("get_public_service_requests", { p_slug: slug, p_session_id: sessionId });
    if (error) {
      if (error.code === "22P02") return []; // not a uuid: not a visit of ours
      throw new Error(`get_public_service_requests failed: ${error.message}`);
    }
    return toPublicServiceRequests(data);
  }
}
