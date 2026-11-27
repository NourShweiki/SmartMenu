import type { StaffOrderEntry } from "@/application/use-cases/orders/get-staff-order-list";
import { kitchenAction, kitchenColumn, KITCHEN_COLUMNS, type KitchenAction, type KitchenColumn } from "@/domain/order/kitchen-board";
import type { OrderStatus } from "@/domain/order/order";
import type { Role } from "@/domain/restaurant/role";
import type { Fils } from "@/domain/shared/money";
import type { LocalizedText } from "@/domain/shared/result";
import type { SessionKind } from "@/domain/table-session/pickup";

/** One ticket on the kitchen screen. Dates travel as ISO strings: the timers tick in the browser. */
export type KitchenTicket = {
  readonly id: string;
  readonly number: number;
  readonly status: OrderStatus;
  readonly kind: SessionKind;
  /** Who it is for: the takeout customer's name, or null (then `tableLabel`). */
  readonly customerName: string | null;
  /** The table's label for an order at a table; null for takeout, or when the table could not be read. */
  readonly tableLabel: string | null;
  readonly placedAt: string;
  readonly statusChangedAt: string;
  readonly lines: readonly { readonly quantity: number; readonly name: LocalizedText; readonly options: readonly LocalizedText[] }[];
  readonly totalFils: Fils;
  /** What this person's button would do (step 1d); null = no button for them. */
  readonly action: KitchenAction | null;
};

export type KitchenBoard = Readonly<Record<KitchenColumn, readonly KitchenTicket[]>>;

/**
 * Sorts the open orders into the kitchen screen's columns (PROJECT_SPEC.md §3.3), oldest first in each. An order
 * whose visit cannot be read counts as a table order (the stricter rule, as on the Orders screen). Orders that are
 * not kitchen work (a served table order waiting for payment) are left out; so are orders of a visit that is over
 * (closed, or past its 2 hours; a table or a takeout pickup): those leftovers, maybe days old, belong to the Orders
 * screen's own group below the queue, where they are completed or cancelled ("not collected"), not to the counter.
 */
export function buildKitchenBoard(entries: readonly StaffOrderEntry[], role: Role): KitchenBoard {
  const board: Record<KitchenColumn, KitchenTicket[]> = { new: [], making: [], ready: [] };
  for (const { order, table } of entries) {
    const kind = table?.kind ?? "TABLE";
    if (table?.sessionStatus === "CLOSED") continue;
    const column = kitchenColumn(order.status, kind);
    if (!column) continue;
    board[column].push({
      id: order.id,
      number: order.number,
      status: order.status,
      kind,
      customerName: table?.customer?.name ?? null,
      tableLabel: kind === "TABLE" ? (table?.label ?? null) : null,
      placedAt: order.createdAt.toISOString(),
      statusChangedAt: order.statusChangedAt.toISOString(),
      lines: order.items.map((item) => ({ quantity: item.quantity, name: item.name, options: item.options.map((o) => o.name) })),
      totalFils: order.totalFils,
      action: kitchenAction(order.status, kind, role),
    });
  }
  for (const column of KITCHEN_COLUMNS) board[column].sort((a, b) => a.placedAt.localeCompare(b.placedAt) || a.number - b.number);
  return board;
}
