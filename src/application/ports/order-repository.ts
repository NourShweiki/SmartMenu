import type { CancelReason, Order, OrderId, OrderStatus, TableSessionId } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";

/**
 * Storage for orders. Every method takes the restaurantId first (tenant scope, data-model skill §1).
 * Reads and status changes run as the signed-in staff member (RLS decides again); `nextNumber` and `place`
 * are server-only operations (service role) because customers have no accounts.
 */
export interface OrderRepository {
  /** Next human-friendly order number for the restaurant (1, 2, 3 ...). A failed order may leave a gap. */
  nextNumber(restaurantId: RestaurantId): Promise<number>;
  /**
   * Writes the order, its lines and picked options atomically (all or nothing), remembering the request key it
   * was placed with (if any). Returns the id of the order that is now stored for this request: `order.id`, or
   * the id of the EARLIER order when the same key was already used in this table session. In that case nothing
   * was written: a repeated submission is the same order, not a second one.
   */
  place(order: Order, requestId?: string): Promise<OrderId>;
  /** The order already placed in this table session with this request key, or null. */
  findByRequest(restaurantId: RestaurantId, sessionId: TableSessionId, requestId: string): Promise<Order | null>;
  findById(restaurantId: RestaurantId, orderId: OrderId): Promise<Order | null>;
  /** Orders still on their way (neither COMPLETED nor CANCELLED), oldest first: the kitchen / floor queue. */
  listOpen(restaurantId: RestaurantId): Promise<Order[]>;
  /** All orders of one table session, oldest first (the running bill). */
  listBySession(restaurantId: RestaurantId, sessionId: TableSessionId): Promise<Order[]>;
  /** All orders of several table sessions in one question, oldest first (the bills of every open table). */
  listBySessions(restaurantId: RestaurantId, sessionIds: readonly TableSessionId[]): Promise<Order[]>;
  /**
   * Moves an order only if it is still in `from`. False when someone else moved it first, it no longer
   * exists, or the database refused this user (never report a change that did not happen).
   */
  updateStatus(restaurantId: RestaurantId, orderId: OrderId, from: OrderStatus, to: OrderStatus): Promise<boolean>;
  /**
   * Cancels an order only if it is still in `from`, with the reason. Same answer as `updateStatus`: false when
   * someone else moved it first, it does not exist here, or the database refused this user. The time and the
   * person are stamped by the database.
   */
  cancel(restaurantId: RestaurantId, orderId: OrderId, from: OrderStatus, reason: CancelReason): Promise<boolean>;
}
