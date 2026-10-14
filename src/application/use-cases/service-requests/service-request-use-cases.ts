import type { ServiceRequestGateway, CreateServiceRequestOutcome, PublicServiceRequest } from "@/application/ports/service-request-gateway";
import type { ServiceRequestRepository, WaitingServiceRequest } from "@/application/ports/service-request-repository";
import type { Clock } from "@/application/ports/system";
import { isServiceKind, resolveServiceRequest, type ServiceKind, type ServiceRequest, type ServiceRequestError, type ServiceRequestId } from "@/domain/service-request/service-request";
import { err, ok, type Result } from "@/domain/shared/result";
import { requirePermission, type ForbiddenError, type StaffActor } from "../permissions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Guests (public: no login; the restaurant comes from the host, the visit from the phone's session cookie) ────

/**
 * A guest at a table asks for something: call the waiter, clean the table, bring the bill. A kind that is not one of
 * the three, or a session id that cannot be a visit, is refused here without touching the database, so junk costs
 * nothing; the database function does the real checks (live table visit, no duplicate, no bill once "ready to pay").
 */
export function makeRequestService(deps: { gateway: ServiceRequestGateway }) {
  return async (input: { slug: string; sessionId: string; kind: string }): Promise<CreateServiceRequestOutcome> => {
    if (!isServiceKind(input.kind)) return err({ type: "INVALID_KIND" });
    if (!UUID.test(input.sessionId)) return err({ type: "SESSION_NOT_FOUND" });
    return deps.gateway.create(input.slug, input.sessionId, input.kind);
  };
}

export type GuestServices = {
  /** The visit's requests, newest first (waiting and done). */
  readonly requests: readonly PublicServiceRequest[];
  /** The kinds still waiting, so the screen can show "the waiter is on the way" instead of offering the button again. */
  readonly waiting: readonly ServiceKind[];
};

/** What a guest's phone shows about its own visit's requests. Empty for a visit that is unknown or not this restaurant's. */
export function makeGetGuestServices(deps: { gateway: ServiceRequestGateway }) {
  return async (input: { slug: string; sessionId: string }): Promise<GuestServices> => {
    const requests = UUID.test(input.sessionId) ? await deps.gateway.forSession(input.slug, input.sessionId) : [];
    return { requests, waiting: [...new Set(requests.filter((r) => r.status === "OPEN").map((r) => r.kind))] };
  };
}

// ─── Staff (owner, manager, waiter: permission `service-requests:handle`; the cashier does not see them) ─────────

/** The waiter's list: what is still waiting in this restaurant, the longest-waiting first, with each table's label. */
export function makeListWaitingServiceRequests(deps: { requests: Pick<ServiceRequestRepository, "listWaiting">; clock: Clock }) {
  return async (actor: StaffActor): Promise<Result<WaitingServiceRequest[], ForbiddenError>> => {
    const allowed = requirePermission(actor, "service-requests:handle");
    if (!allowed.ok) return allowed;
    return ok(await deps.requests.listWaiting(actor.restaurantId, deps.clock.now()));
  };
}

export type ResolveServiceRequestError =
  | ForbiddenError
  | Extract<ServiceRequestError, { type: "ALREADY_DONE" }>
  | { type: "REQUEST_NOT_FOUND" }
  /** Someone else resolved it first (or the database refused this user). Reload and look again. */
  | { type: "CONFLICT" };

/**
 * The waiter marks a request done: they came, the table is clean, the bill was brought. Done is final. The database
 * enforces the same permission and the same one-way move, so this never relies on the screen alone.
 */
export function makeResolveServiceRequest(deps: { requests: Pick<ServiceRequestRepository, "findById" | "markDone">; clock: Clock }) {
  return async (actor: StaffActor, input: { requestId: ServiceRequestId }): Promise<Result<ServiceRequest, ResolveServiceRequestError>> => {
    const allowed = requirePermission(actor, "service-requests:handle");
    if (!allowed.ok) return allowed;

    const found = await deps.requests.findById(actor.restaurantId, input.requestId);
    if (!found || found.restaurantId !== actor.restaurantId) return err({ type: "REQUEST_NOT_FOUND" });
    const done = resolveServiceRequest(found, deps.clock.now());
    if (!done.ok) return err({ type: "ALREADY_DONE" }); // the only way the domain refuses a resolve

    const saved = await deps.requests.markDone(actor.restaurantId, found.id);
    return saved ? done : err({ type: "CONFLICT" });
  };
}
