import { getTranslations } from "next-intl/server";
import type { OrderStatus } from "@/domain/order/order";
import { localized } from "@/domain/shared/localized";
import { PendingSubmit } from "@/interface/web/components/pending-submit";
import { formatDayTime, formatPrice, formatTime } from "@/interface/web/format";
import type { Locale } from "@/interface/web/i18n/locales";
import { moveOrderAction } from "./order-queue-actions";
import type { OrderQueue, QueueOrder } from "./order-queue-model";

// How urgent a status looks: NEW asks for attention, SERVED is nearly done.
const STATUS_STYLE: Record<OrderStatus, string> = {
  NEW: "bg-red-50 text-red-700 ring-red-200",
  CONFIRMED: "bg-blue-50 text-blue-800 ring-blue-200",
  PREPARING: "bg-amber-50 text-amber-900 ring-amber-200",
  READY: "bg-green-50 text-green-800 ring-green-200",
  SERVED: "bg-gray-100 text-gray-700 ring-gray-200",
  COMPLETED: "bg-gray-100 text-gray-500 ring-gray-200",
};
const pill = "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1";
/** Up to this many leftover orders are shown straight away; more than that start folded. */
const ENDED_SHOWN_OPEN = 5;

/** The staff order screen's lists: the live queue, and below it the unfinished orders of visits that are over. */
export async function OrderQueueView({ locale, queue }: { locale: Locale; queue: OrderQueue }) {
  const t = await getTranslations("StaffOrders");
  const common = await getTranslations("Common");

  const card = (order: QueueOrder) => (
    <li key={order.id} className="flex flex-col gap-3 p-4" aria-label={t("order", { number: order.number })}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">
            <bdi>{t("order", { number: order.number })}</bdi>
          </h3>
          <span className={`${pill} bg-gray-900 text-white ring-gray-900`}>
            <bdi>{order.tableLabel === null ? t("noTable") : t("table", { label: order.tableLabel })}</bdi>
          </span>
          <span className={`${pill} ${STATUS_STYLE[order.status]}`}>{t(`status.${order.status}`)}</span>
          {order.visit && <span className={`${pill} bg-white text-gray-700 ring-gray-300`}>{t(`visit.${order.visit}`)}</span>}
        </div>
        <p className="text-sm text-gray-500">
          {/* An order of a visit that is over may be from another day: say which. */}
          {t.rich("placedAt", { time: () => <bdi>{order.visit === "ended" ? formatDayTime(order.placedAt, locale) : formatTime(order.placedAt, locale)}</bdi> })}
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {order.lines.map((line, i) => (
          <li key={i} className="flex gap-2">
            <bdi className="shrink-0 font-semibold tabular-nums">{line.quantity} ×</bdi>
            <span>
              {localized(line.name, locale)}
              {line.options.length > 0 && (
                <span className="block text-sm text-gray-600">{line.options.map((o) => localized(o, locale)).join(" · ")}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {t("total")}: <bdi className="font-semibold text-gray-900">{formatPrice(order.totalFils, locale)}</bdi>
        </p>
        {order.next ? (
          <form action={moveOrderAction.bind(null, locale, order.id, order.next)}>
            <PendingSubmit
              pendingLabel={common("saving")}
              className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {t(`action.${order.next}`)}
            </PendingSubmit>
          </form>
        ) : (
          order.waitingFor && <p className="text-sm text-gray-500">{t(`waiting.${order.waitingFor}`)}</p>
        )}
      </div>
    </li>
  );

  const list = (orders: readonly QueueOrder[]) => (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">{orders.map(card)}</ul>
  );

  if (queue.live.length === 0 && queue.ended.length === 0) return <p className="py-10 text-center text-gray-500">{t("empty")}</p>;

  return (
    <>
      <section aria-labelledby="orders-live" className="flex flex-col gap-3">
        <h2 id="orders-live" className="text-lg font-semibold">
          {t("liveTitle")}
        </h2>
        {queue.live.length === 0 ? <p className="py-4 text-gray-500">{t("empty")}</p> : list(queue.live)}
      </section>

      {queue.ended.length > 0 && (
        // Folded away when it is long, so leftovers never push the live orders around or slow the screen down.
        <details open={queue.ended.length <= ENDED_SHOWN_OPEN} className="group flex flex-col gap-3">
          <summary className="cursor-pointer rounded-lg py-1">
            <h2 className="inline text-lg font-semibold">
              {t("endedTitle")} <bdi className="font-normal text-gray-500">({queue.ended.length})</bdi>
            </h2>
          </summary>
          <p className="mb-3 mt-1 text-sm text-gray-600">{t("endedHint")}</p>
          {list(queue.ended)}
        </details>
      )}
    </>
  );
}
