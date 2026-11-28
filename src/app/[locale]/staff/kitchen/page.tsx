import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { orders } from "@/infrastructure/container";
import { FullScreenButton } from "@/interface/web/components/full-screen-button";
import { KeepAwake } from "@/interface/web/components/keep-awake";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { LiveRefresh } from "@/interface/web/components/live-refresh";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { KitchenBoardView } from "@/interface/web/staff/kitchen-board";
import { buildKitchenBoard } from "@/interface/web/staff/kitchen-board-model";
import { NewOrderAlert } from "@/interface/web/staff/new-order-alert";
import { requireStaff } from "@/interface/web/staff/require-staff";

// The kitchen screen (PROJECT_SPEC.md §3.3): the open orders as tickets in three columns with live timers, for a
// touch screen or small PC at the counter. Same orders and rules as the Orders screen; a screen, not a role.
export default async function StaffKitchenPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  const [t, entries] = await Promise.all([
    getTranslations("StaffKitchen"),
    orders.getForStaff({ restaurantId: staff.restaurantId, role: staff.role }),
  ]);
  const board = buildKitchenBoard(entries, staff.role);
  const serverNow = new Date().toISOString();

  return (
    <main className="min-h-screen bg-gray-100">
      <div className="flex flex-col gap-4 px-4 py-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-4">
            <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
              <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("back")}
            </Link>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-gray-500">{localized(restaurant.name, locale)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <NewOrderAlert newOrderIds={board.new.filter((o) => o.status === "NEW").map((o) => o.id)} />
            <FullScreenButton enterLabel={t("fullScreen")} exitLabel={t("exitFullScreen")} />
            <LanguageSwitch locale={locale} path="/staff/kitchen" />
          </div>
        </header>
        <LiveRefresh />
        <KeepAwake />
        <KitchenBoardView locale={locale} board={board} serverNow={serverNow} />
      </div>
    </main>
  );
}
