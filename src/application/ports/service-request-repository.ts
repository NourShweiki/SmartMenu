import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { ServiceRequest, ServiceRequestId } from "@/domain/service-request/service-request";

/** A waiting request with the label of its table: what the waiter needs on screen ("Table 7: call the waiter"). */
export type WaitingServiceRequest = { readonly request: ServiceRequest; readonly tableLabel: string };

/**
 * The STAFF side of service requests: runs as the signed-in staff member, so the database decides again who may read
 * and resolve (owner, manager, waiter; the cashier sees nothing and gets empty answers). Customers never use this;
 * they go through `ServiceRequestGateway`. Every method takes the restaurantId first (tenant scope, data-model skill §1).
 */
export interface ServiceRequestRepository {
  /**
   * What is still waiting in this restaurant, the longest-waiting first, each with its table's label. Requests of a
   * visit that is already closed, or ran out of its 2 hours (`now` decides: such a visit is closed lazily, so the
   * stored request still says OPEN), are left out: nobody is waiting for them any more.
   */
  listWaiting(restaurantId: RestaurantId, now: Date): Promise<WaitingServiceRequest[]>;
  /** One request of this restaurant, or null when it does not exist here (or this user may not read it). */
  findById(restaurantId: RestaurantId, id: ServiceRequestId): Promise<ServiceRequest | null>;
  /**
   * Marks a request done only if it is still waiting. False when someone else did it first, it does not exist here,
   * or the database refused this user (never report a change that did not happen). The time is set by the database.
   */
  markDone(restaurantId: RestaurantId, id: ServiceRequestId): Promise<boolean>;
}
