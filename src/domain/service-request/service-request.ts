import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import { effectiveSessionStatus, type TableId, type TableSession, type TableSessionId } from "@/domain/table-session/table-session";

export type ServiceRequestId = string & { readonly __brand: "ServiceRequestId" };

/**
 * What a guest at a table can ask for without ordering (spec §4: "can request waiter / cleaning / payment"):
 * call the waiter, have the table cleaned, ask for the bill. The waiter's screen is where they are handled
 * (permission `service-requests:handle`: owner, manager, waiter; the cashier does not see them, spec §4).
 */
export const SERVICE_KINDS = ["CALL_WAITER", "CLEAN_TABLE", "REQUEST_BILL"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

/** A request is waiting (OPEN) until staff mark it DONE. There is no cancel: a guest who changed their mind just waits for the visit. */
export const SERVICE_REQUEST_STATUSES = ["OPEN", "DONE"] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

/**
 * One request, tied to the table VISIT (spec §4: everything of one visit belongs to its session), and to its table so
 * the waiter's screen can say "Table 7" without a lookup.
 */
export type ServiceRequest = {
  readonly id: ServiceRequestId;
  readonly restaurantId: RestaurantId;
  readonly sessionId: TableSessionId;
  readonly tableId: TableId;
  readonly kind: ServiceKind;
  readonly status: ServiceRequestStatus;
  readonly createdAt: Date;
  /** Set when staff marked it done. */
  readonly resolvedAt: Date | null;
};

export type ServiceRequestError =
  | { type: "INVALID_KIND" }
  /** A takeout (pickup) visit has no table to serve. */
  | { type: "NOT_A_TABLE_VISIT" }
  /** The visit is closed, or ran out of its 2 hours: scan the table again. */
  | { type: "SESSION_ENDED" }
  /** The same request is already waiting for this visit (stops a guest, or two phones, from piling them up), or the bill is already being prepared. */
  | { type: "ALREADY_REQUESTED" }
  | { type: "ALREADY_DONE" };

export type ServiceRequestDeps = { newId: () => string };

export const isServiceKind = (value: unknown): value is ServiceKind => (SERVICE_KINDS as readonly unknown[]).includes(value);

/**
 * A guest's request. `openKinds` = the kinds still waiting for this visit (see `openKindsOf`). Rules:
 *  - only a TABLE visit that is still live (not closed, not past its 2 hours);
 *  - one waiting request per kind per visit;
 *  - the bill cannot be asked for once the waiter has already signalled "ready to pay" (PAYMENT_REQUESTED): it is on its way.
 * ASSUMPTION to confirm: asking for the bill before anything was ordered is allowed (the waiter simply sees an empty bill).
 */
export function createServiceRequest(
  session: TableSession,
  kind: string,
  openKinds: readonly ServiceKind[],
  deps: ServiceRequestDeps,
  now: Date,
): Result<ServiceRequest, ServiceRequestError> {
  if (!isServiceKind(kind)) return err({ type: "INVALID_KIND" });
  if (session.kind !== "TABLE" || session.tableId === null) return err({ type: "NOT_A_TABLE_VISIT" });
  const status = effectiveSessionStatus(session, now);
  if (status === "CLOSED") return err({ type: "SESSION_ENDED" });
  if (openKinds.includes(kind) || (kind === "REQUEST_BILL" && status === "PAYMENT_REQUESTED")) return err({ type: "ALREADY_REQUESTED" });
  return ok({
    id: deps.newId() as ServiceRequestId,
    restaurantId: session.restaurantId,
    sessionId: session.id,
    tableId: session.tableId,
    kind,
    status: "OPEN",
    createdAt: now,
    resolvedAt: null,
  });
}

/** Staff mark a request done (the waiter came, the table is clean, the bill was brought). Done is final. */
export function resolveServiceRequest(request: ServiceRequest, now: Date): Result<ServiceRequest, ServiceRequestError> {
  if (request.status === "DONE") return err({ type: "ALREADY_DONE" });
  return ok({ ...request, status: "DONE", resolvedAt: now });
}

/** The kinds still waiting for one visit: what `createServiceRequest` needs to refuse a duplicate. */
export const openKindsOf = (requests: readonly ServiceRequest[], sessionId: TableSessionId): ServiceKind[] => [
  ...new Set(requests.filter((r) => r.sessionId === sessionId && r.status === "OPEN").map((r) => r.kind)),
];

/** The waiter's list: what is still waiting, the longest-waiting first. */
export const waitingRequests = (requests: readonly ServiceRequest[]): ServiceRequest[] =>
  requests.filter((r) => r.status === "OPEN").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
