import type { StaffOrderEntry } from "@/application/use-cases/orders/get-staff-order-list";
import { nextStatus, permissionToCancel, permissionsToMoveTo, type OrderStatus } from "@/domain/order/order";
import { can, type Role } from "@/domain/restaurant/role";
import type { Fils } from "@/domain/shared/money";
import type { LocalizedText } from "@/domain/shared/result";
import type { PickupCustomer } from "@/domain/table-session/pickup";

/** One order as the staff order screen shows it. Names stay in both languages: the screen picks one. */
export type QueueOrder = {
  readonly id: string;
  readonly number: number;
  readonly status: OrderStatus;
  /** Null for a takeout order, and when the table could not be read (the order is shown anyway). */
  readonly tableLabel: string | null;
  /** Who a takeout (pickup) order is for; null for an order at a table. */
  readonly pickup: PickupCustomer | null;
  /** The state of the table's visit, when it is worth a badge: the bill was asked for, or the visit is over. */
  readonly visit: "paymentRequested" | "ended" | null;
  readonly placedAt: Date;
  readonly lines: readonly { readonly quantity: number; readonly name: LocalizedText; readonly options: readonly LocalizedText[] }[];
  readonly totalFils: Fils;
  /** The step this person may take now (the button), or null. */
  readonly next: OrderStatus | null;
  /**
   * Why there is no button although the order is not finished: its next step is somebody else's.
   * "cashier" = it is served and waits for payment; "floor" = the floor staff move it (confirm ... served).
   */
  readonly waitingFor: "cashier" | "floor" | null;
  /**
   * May this person cancel the order as it is now? (The waiter before the kitchen starts; owner and manager any
   * order that is not completed; the cashier never. The use case and the database decide again.)
   */
  readonly canCancel: boolean;
};

export type OrderQueue = {
  /** Orders of visits that are still going on (or whose table is unknown), oldest first. */
  readonly live: readonly QueueOrder[];
  /**
   * Unfinished orders of visits that are over (closed, or past the 2-hour limit). Kept apart and still actionable:
   * otherwise they would sit at the top of the queue forever, looking like work for a table that has left.
   */
  readonly ended: readonly QueueOrder[];
};

/**
 * Turns the staff order list into what the screen shows for THIS role: which button each order gets (the roles
 * mirror the database rules: the floor moves an order up to SERVED, the cashier completes it after payment, owner
 * and manager do both), and which orders belong to visits that have ended.
 */
export function buildOrderQueue(entries: readonly StaffOrderEntry[], role: Role): OrderQueue {
  const live: QueueOrder[] = [];
  const ended: QueueOrder[] = [];
  for (const { order, table } of entries) {
    const step = nextStatus(order.status);
    // On a takeout order the cashier may take every step (the counter is often the cashier alone).
    const mine = step !== null && permissionsToMoveTo(step, table?.kind ?? "TABLE").some((permission) => can(role, permission));
    const cancelPermission = permissionToCancel(order.status);
    const row: QueueOrder = {
      id: order.id,
      number: order.number,
      status: order.status,
      tableLabel: table?.label ?? null,
      pickup: table?.customer ?? null,
      visit: table?.sessionStatus === "CLOSED" ? "ended" : table?.sessionStatus === "PAYMENT_REQUESTED" ? "paymentRequested" : null,
      placedAt: order.createdAt,
      lines: order.items.map((item) => ({ quantity: item.quantity, name: item.name, options: item.options.map((o) => o.name) })),
      totalFils: order.totalFils,
      next: mine ? step : null,
      waitingFor: step === null || mine ? null : step === "COMPLETED" ? "cashier" : "floor",
      canCancel: cancelPermission !== null && can(role, cancelPermission),
    };
    (row.visit === "ended" ? ended : live).push(row);
  }
  return { live, ended };
}
