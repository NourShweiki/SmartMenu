import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { tableSessions } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { LiveRefresh } from "@/interface/web/staff/live-refresh";
import { OpenTablesView } from "@/interface/web/staff/open-tables";
import { buildOpenTables } from "@/interface/web/staff/open-tables-model";
import { requireStaff } from "@/interface/web/staff/require-staff";

// The staff "open tables" screen: every table with guests, its running bill, "ready to pay" and "close table".
// Every role sees it; the buttons depend on the role (the floor signals payment, the cashier closes).
export default async function StaffOpenTablesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  const [t, visits] = await Promise.all([
    getTranslations("OpenTables"),
    tableSessions.listOpen({ restaurantId: staff.restaurantId, role: staff.role }),
  ]);
  const tables = buildOpenTables(visits, staff.role);

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
            <a href={`/${locale}/staff/open-tables`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100">
              {t("refresh")}
            </a>
            <LanguageSwitch locale={locale} path="/staff/open-tables" />
          </div>
        </header>

        <p className="text-gray-600">{t("hint")}</p>
        <LiveRefresh />
        <OpenTablesView locale={locale} tables={tables} />
      </div>
    </main>
  );
}
