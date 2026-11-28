import { getTranslations } from "next-intl/server";
import { KITCHEN_COLUMNS, type KitchenColumn } from "@/domain/order/kitchen-board";
import { CANCEL_REASONS } from "@/domain/order/order";
import { localized } from "@/domain/shared/localized";
import { formatPrice } from "@/interface/web/format";
import type { Locale } from "@/interface/web/i18n/locales";
import { CancelOrder } from "./cancel-order";
import { kitchenCancelAction, kitchenTapAction } from "./kitchen-actions";
import type { KitchenBoard, KitchenTicket } from "./kitchen-board-model";
import { KitchenTapButton } from "./kitchen-tap-button";
import { KitchenTimer } from "./kitchen-timer";

const COLUMN_STYLE: Record<KitchenColumn, string> = {
  new: "border-t-red-500",
  making: "border-t-amber-500",
  ready: "border-t-green-600",
};

/**
 * The kitchen screen's board (PROJECT_SPEC.md §3.3): three columns, one ticket per order, oldest first. Built for a
 * counter: large type, readable from a step back, no hover-only detail. One big button per ticket (with a few seconds
 * to undo it) and "Cancel order" with a reason, under the same rules as the Orders screen.
 */
export async function KitchenBoardView({ locale, board, serverNow }: { locale: Locale; board: KitchenBoard; serverNow: string }) {
  const t = await getTranslations("StaffKitchen");
  const orders = await getTranslations("StaffOrders");
  const common = await getTranslations("Common");
  const cancelLabels = { open: orders("cancel.open"), reason: orders("cancel.reasonLabel"), confirm: orders("cancel.confirm"), keep: orders("cancel.keep"), working: common("saving") };
  const cancelReasons = CANCEL_REASONS.map((value) => ({ value, label: orders(`cancel.reasons.${value}`) }));

  const ticket = (order: KitchenTicket, column: KitchenColumn) => (
    <li key={order.id} className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200" aria-label={t("order", { number: order.number })}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-2xl font-bold leading-tight">
            <bdi>{t("number", { number: order.number })}</bdi>
          </p>
          <KitchenTimer status={order.status} kind={order.kind} placedAt={order.placedAt} statusChangedAt={order.statusChangedAt} serverNow={serverNow} />
        </div>
        {/* The name is what staff call out: never cut off, it wraps on a narrow screen. */}
        <p className="break-words text-lg font-semibold text-gray-800">
          <bdi>{order.customerName ?? (order.tableLabel === null ? t("noTable") : t("table", { label: order.tableLabel }))}</bdi>
        </p>
      </div>

      <ul className="flex flex-col gap-2 border-t border-gray-100 pt-3">
        {order.lines.map((line, i) => (
          <li key={i} className="flex gap-2 text-lg">
            <bdi className="shrink-0 font-bold tabular-nums">{line.quantity} ×</bdi>
            <span className="min-w-0">
              <span className="font-semibold">{localized(line.name, locale)}</span>
              {line.options.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {line.options.map((option, j) => (
                    <span key={j} className="rounded-md bg-amber-100 px-2 py-0.5 text-base font-semibold text-amber-950 ring-1 ring-amber-300">
                      {localized(option, locale)}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className={`flex items-baseline justify-between gap-2 border-t border-gray-100 pt-3 ${column === "ready" ? "text-2xl font-bold" : "text-base text-gray-600"}`}>
        <span>{t("total")}</span>
        <bdi className="whitespace-nowrap tabular-nums">{formatPrice(order.totalFils, locale)}</bdi>
      </p>

      {order.action && order.button && <KitchenTapButton action={kitchenTapAction.bind(null, locale, order.id, order.action.tap)} button={order.button} />}
      {order.canCancel && <CancelOrder action={kitchenCancelAction.bind(null, locale, order.id)} reasons={cancelReasons} labels={cancelLabels} />}
    </li>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {KITCHEN_COLUMNS.map((column) => (
        <section key={column} aria-labelledby={`kitchen-${column}`} className={`flex flex-col gap-3 rounded-2xl border-t-8 bg-gray-200/60 p-3 ${COLUMN_STYLE[column]}`}>
          <h2 id={`kitchen-${column}`} className="flex items-center justify-between px-1 text-xl font-bold">
            <span>{t(`columns.${column}`)}</span>
            <span className="rounded-full bg-gray-900 px-3 py-0.5 text-base text-white tabular-nums">{board[column].length}</span>
          </h2>
          {board[column].length === 0 ? (
            <p className="px-1 py-6 text-center text-gray-500">{t(`empty.${column}`)}</p>
          ) : (
            <ul className="flex flex-col gap-3">{board[column].map((order) => ticket(order, column))}</ul>
          )}
        </section>
      ))}
    </div>
  );
}
