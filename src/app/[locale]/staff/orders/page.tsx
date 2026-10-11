import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { orders } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { LiveRefresh } from "@/interface/web/components/live-refresh";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { NewOrderAlert } from "@/interface/web/staff/new-order-alert";
import { OrderQueueView } from "@/interface/web/staff/order-queue";
import { buildOrderQueue } from "@/interface/web/staff/order-queue-model";
import { requireStaff } from "@/interface/web/staff/require-staff";

// The staff order screen: every role sees the open orders of their restaurant with their table; the buttons
// depend on the role (the floor moves an order up to "served", the cashier completes it after payment).
export default async function StaffOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  const [t, entries] = await Promise.all([
    getTranslations("StaffOrders"),
    orders.getForStaff({ restaurantId: staff.restaurantId, role: staff.role }),
  ]);
  const queue = buildOrderQueue(entries, staff.role);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
              <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("back")}
            </Link>
            <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* A plain link to the same page: a full, fresh load, for when someone does not want to wait for the next update. */}
            <a href={`/${locale}/staff/orders`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100">
              {t("refresh")}
            </a>
            <LanguageSwitch locale={locale} path="/staff/orders" />
          </div>
        </header>

        <p className="text-gray-600">{t("hint")}</p>
        {/* The list refreshes itself; an order that is NEW and was not there before gets a notice and, if switched on, a sound. */}
        <LiveRefresh />
        <NewOrderAlert newOrderIds={[...queue.live, ...queue.ended].filter((o) => o.status === "NEW").map((o) => o.id)} />
        <OrderQueueView locale={locale} queue={queue} />
      </div>
    </main>
  );
}
