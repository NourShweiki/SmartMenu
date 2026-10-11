import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";
import { PendingSubmit } from "@/interface/web/components/pending-submit";
import { formatDayTime, formatPrice, formatTime } from "@/interface/web/format";
import type { Locale } from "@/interface/web/i18n/locales";
import { moveVisitAction } from "./open-tables-actions";
import type { OpenTableRow } from "./open-tables-model";

const STATE_STYLE: Record<OpenTableRow["state"], string> = {
  open: "bg-green-50 text-green-800 ring-green-200",
  paymentRequested: "bg-amber-50 text-amber-900 ring-amber-200",
  timedOut: "bg-red-50 text-red-700 ring-red-200",
};
const pill = "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1";

/** The staff "open tables" screen: every table with guests, its orders, its running bill and what can be done with it. */
export async function OpenTablesView({ locale, tables }: { locale: Locale; tables: readonly OpenTableRow[] }) {
  const t = await getTranslations("OpenTables");
  const orderText = await getTranslations("StaffOrders");
  const common = await getTranslations("Common");

  if (tables.length === 0) return <p className="py-10 text-center text-gray-500">{t("empty")}</p>;

  const money = (label: string, fils: OpenTableRow["bill"]["totalFils"], strong = false) => (
    <div className={`flex items-center justify-between gap-4 ${strong ? "text-lg font-semibold" : "text-sm text-gray-600"}`}>
      <dt>{label}</dt>
      <dd>
        <bdi>{formatPrice(fils, locale)}</bdi>
      </dd>
    </div>
  );

  return (
    <ul className="flex flex-col gap-4">
      {tables.map((table) => (
        <li
          key={table.sessionId}
          aria-label={t("table", { label: table.tableLabel })}
          className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">
                <bdi>{t("table", { label: table.tableLabel })}</bdi>
              </h2>
              <span className={`${pill} ${STATE_STYLE[table.state]}`}>{t(`state.${table.state}`)}</span>
            </div>
            <p className="text-sm text-gray-500">
              {/* A visit that timed out may have started on another day: say which. */}
              {t.rich("since", {
                time: () => <bdi>{table.state === "timedOut" ? formatDayTime(table.startedAt, locale) : formatTime(table.startedAt, locale)}</bdi>,
              })}
            </p>
          </div>

          {table.state === "timedOut" && (
            <p role="note" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {t("timedOutHint")}
            </p>
          )}

          {table.orders.length === 0 ? (
            <p className="text-gray-500">{t("noOrders")}</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100">
                {table.orders.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <bdi className="font-semibold">{t("order", { number: order.number })}</bdi>
                      <span className="text-sm text-gray-600">{orderText(`status.${order.status}`)}</span>
                    </span>
                    <bdi className="tabular-nums">{formatPrice(order.totalFils, locale)}</bdi>
                  </li>
                ))}
              </ul>
              <dl className="flex flex-col gap-1 border-t border-gray-200 pt-3">
                {money(t("subtotal"), table.bill.subtotalFils)}
                {table.bill.serviceChargeFils > 0 && money(t("service"), table.bill.serviceChargeFils)}
                {table.bill.taxFils > 0 && money(t("tax"), table.bill.taxFils)}
                {money(t("total"), table.bill.totalFils, true)}
              </dl>
            </>
          )}

          {(table.canRequestPayment || table.close !== "notYours") && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {table.close === "unfinished" && (
                <p className="me-auto text-sm text-gray-600">
                  {t("unfinished", { count: table.unfinished })}{" "}
                  <Link href={`/${locale}/staff/orders`} className="font-semibold underline hover:text-gray-900">
                    {t("goToOrders")}
                  </Link>
                </p>
              )}
              {table.canRequestPayment && (
                <form action={moveVisitAction.bind(null, locale, table.sessionId, "PAYMENT_REQUESTED")}>
                  <PendingSubmit
                    pendingLabel={common("saving")}
                    className="rounded-lg border border-gray-900 bg-white px-4 py-2 font-semibold hover:bg-gray-100 disabled:opacity-50"
                  >
                    {t("requestPayment")}
                  </PendingSubmit>
                </form>
              )}
              {table.close === "allowed" && (
                <form action={moveVisitAction.bind(null, locale, table.sessionId, "CLOSED")}>
                  <ConfirmSubmit
                    question={t("closeConfirm", { label: table.tableLabel })}
                    className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-gray-700"
                  >
                    {t("close")}
                  </ConfirmSubmit>
                </form>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
