import type { Order, OrderId, OrderStatus, TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";

/**
 * Storage for orders. Every method takes the restaurantId first (tenant scope, data-model skill §1).
 * Reads and status changes run as the signed-in staff member (RLS decides again); `nextNumber` and `place`
 * are server-only operations (service role) because customers have no accounts.
 */
export interface OrderRepository {
  /** Next human-friendly order number for the restaurant (1, 2, 3 ...). A failed order may leave a gap. */
  nextNumber(restaurantId: RestaurantId): Promise<number>;
  /** Writes the order, its lines and picked options atomically (all or nothing). */
  place(order: Order): Promise<void>;
  findById(restaurantId: RestaurantId, orderId: OrderId): Promise<Order | null>;
  /** Orders not yet COMPLETED, oldest first: the kitchen / floor queue. */
  listOpen(restaurantId: RestaurantId): Promise<Order[]>;
  /** All orders of one table session, oldest first (the running bill). */
  listBySession(restaurantId: RestaurantId, sessionId: TableSessionId): Promise<Order[]>;
  /**
   * Moves an order only if it is still in `from`. False when someone else moved it first, it no longer
   * exists, or the database refused this user (never report a change that did not happen).
   */
  updateStatus(restaurantId: RestaurantId, orderId: OrderId, from: OrderStatus, to: OrderStatus): Promise<boolean>;
}
