import type { OpenVisit } from "@/application/use-cases/tables/get-open-visits";
import type { BillTotals, OrderStatus } from "@/domain/order/order";
import { can, type Role } from "@/domain/restaurant/role";
import type { Fils } from "@/domain/shared/money";
import { permissionToMoveSessionTo } from "@/domain/table-session/table-session";

/** One table with guests, as the staff "open tables" screen shows it to THIS person. */
export type OpenTableRow = {
  readonly sessionId: string;
  readonly tableLabel: string;
  /**
   * "timedOut" = the visit passed its 2-hour limit and nobody closed it: guests cannot order any more, and it
   * waits here for staff to settle its orders and close it.
   */
  readonly state: "open" | "paymentRequested" | "timedOut";
  readonly startedAt: Date;
  readonly orders: readonly { readonly id: string; readonly number: number; readonly status: OrderStatus; readonly totalFils: Fils }[];
  readonly bill: BillTotals;
  /** May this person signal "ready to pay" now? (Only for a visit that is still open.) */
  readonly canRequestPayment: boolean;
  /**
   * Closing: "allowed" (this person may, and every order is completed), "unfinished" (this person may, but
   * `unfinished` orders have to be completed first), "notYours" (closing is somebody else's job: no button).
   */
  readonly close: "allowed" | "unfinished" | "notYours";
  readonly unfinished: number;
};

/**
 * Turns the open visits into what the screen shows for this role. The buttons mirror the rules of the use case and
 * the database: the floor signals "ready to pay", the cashier closes, owner and manager do both; a visit cannot be
 * closed while it has unfinished orders.
 */
export function buildOpenTables(visits: readonly OpenVisit[], role: Role): OpenTableRow[] {
  const mayClose = can(role, permissionToMoveSessionTo("CLOSED"));
  const maySignal = can(role, permissionToMoveSessionTo("PAYMENT_REQUESTED"));
  return visits.map((visit) => ({
    sessionId: visit.session.id,
    tableLabel: visit.tableLabel,
    state: visit.status === "CLOSED" ? "timedOut" : visit.status === "PAYMENT_REQUESTED" ? "paymentRequested" : "open",
    startedAt: visit.session.startedAt,
    orders: visit.orders.map((o) => ({ id: o.id, number: o.number, status: o.status, totalFils: o.totalFils })),
    bill: visit.bill,
    canRequestPayment: maySignal && visit.status === "OPEN",
    close: !mayClose ? "notYours" : visit.unfinished > 0 ? "unfinished" : "allowed",
    unfinished: visit.unfinished,
  }));
}
