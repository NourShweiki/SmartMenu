import type { CreateServiceRequestOutcome } from "@/application/ports/service-request-gateway";
import type { ServiceKind } from "@/domain/service-request/service-request";
import type { RateLimiter } from "./rate-limit";

/** Why a guest's request was not made, as the services page shows it (one translated message each: `Services.errors.<problem>`). */
export type ServiceProblem =
  | "alreadyRequested" // the same request is already waiting (or the bill is already being prepared)
  | "sessionEnded" // the visit is over (closed, or past its 2 hours): scan the table's code again
  | "notATable" // no table scanned on this device, or a takeout visit: there is no table to serve
  | "invalidRequest" // not something the page sends
  | "tooMany" // this device (or the restaurant) asked too often; try again in a few minutes
  | "failed"; // anything unexpected

export type ServiceOutcome = { ok: true; kind: ServiceKind } | { ok: false; problem: ServiceProblem };

/** What the database function and the use case answered, as the page shows it. */
export function toServiceOutcome(result: CreateServiceRequestOutcome): ServiceOutcome {
  if (result.ok) return { ok: true, kind: result.value.kind };
  switch (result.error.type) {
    case "ALREADY_REQUESTED":
      return { ok: false, problem: "alreadyRequested" };
    case "NOT_A_TABLE_VISIT":
      return { ok: false, problem: "notATable" };
    case "INVALID_KIND":
      return { ok: false, problem: "invalidRequest" };
    case "SESSION_ENDED":
    case "SESSION_NOT_FOUND": // a visit that is not this restaurant's (an old cookie): the same advice, scan again
      return { ok: false, problem: "sessionEnded" };
  }
}

type Deps = {
  request: (input: { slug: string; sessionId: string; kind: string }) => Promise<CreateServiceRequestOutcome>;
  /** Per device. */
  deviceLimit: RateLimiter;
  /** Per restaurant: bounds the load even when a visitor changes addresses. */
  restaurantLimit: RateLimiter;
};

/**
 * A guest presses one of the three buttons. The restaurant comes from the host (the caller) and the visit from the
 * phone's HttpOnly session cookie (`sessionId`, null when no table was scanned): nothing tenant-related is read from
 * the browser, which sends only the KIND. Limits are checked only for requests that could be made at all.
 */
export async function askForService(
  deps: Deps,
  input: { slug: string; restaurantId: string; sessionId: string | null; kind: unknown; clientHash: string | null },
): Promise<ServiceOutcome> {
  if (typeof input.kind !== "string") return { ok: false, problem: "invalidRequest" };
  if (input.sessionId === null) return { ok: false, problem: "notATable" };

  // A device we cannot tell apart (no usable address) gets no device limit: one shared bucket would lock everybody out.
  if ((input.clientHash !== null && !deps.deviceLimit.hit(input.clientHash)) || !deps.restaurantLimit.hit(input.restaurantId)) {
    return { ok: false, problem: "tooMany" };
  }
  return toServiceOutcome(await deps.request({ slug: input.slug, sessionId: input.sessionId, kind: input.kind }));
}
