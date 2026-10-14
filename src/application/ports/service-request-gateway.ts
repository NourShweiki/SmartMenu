import type { Result } from "@/domain/shared/result";
import type { ServiceKind, ServiceRequestError, ServiceRequestStatus } from "@/domain/service-request/service-request";

/** One request of the visit a guest's phone holds, as far as the guest may see it: what, how far, and when. No ids of anything else. */
export type PublicServiceRequest = {
  readonly id: string;
  readonly kind: ServiceKind;
  readonly status: ServiceRequestStatus;
  readonly createdAt: Date;
};

/** A guest's request was made, or refused by the database with the same reasons as the domain rules; or the visit is not this restaurant's. */
export type CreateServiceRequestOutcome = Result<
  { readonly id: string; readonly kind: ServiceKind },
  Exclude<ServiceRequestError, { type: "ALREADY_DONE" }> | { type: "SESSION_NOT_FOUND" }
>;

/**
 * Customers have no accounts, so this goes through narrow public database functions (no table access). The restaurant
 * is identified by its slug, which the caller took from the host, never from the request body; the visit is the
 * session id the guest's phone holds (the same key it uses to order).
 */
export interface ServiceRequestGateway {
  /** Asks for something at the guest's table. */
  create(slug: string, sessionId: string, kind: string): Promise<CreateServiceRequestOutcome>;
  /** The requests of this visit, newest first. Empty when the visit is unknown or not this restaurant's. */
  forSession(slug: string, sessionId: string): Promise<PublicServiceRequest[]>;
}
