import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@/domain/restaurant/role";
import { localized } from "@/domain/shared/localized";
import { tables } from "@/infrastructure/container";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { requireStaff } from "@/interface/web/staff/require-staff";
import {
  addTableAction,
  deleteTableAction,
  regenerateTableTokenAction,
  renameTableAction,
  setTableActiveAction,
} from "@/interface/web/staff/table-actions";
import { AddTableForm, TableCardRow } from "@/interface/web/staff/tables-manager";
import { getRequestOrigin, tableScanUrl } from "@/interface/web/tables/scan-url";

// Owner / manager: tables and their QR codes (permission `tables:manage`).
export default async function TablesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  if (!can(staff.role, "tables:manage")) notFound();

  const list = await tables.list({ restaurantId: staff.restaurantId, role: staff.role });
  if (!list.ok) notFound();
  const [t, origin] = await Promise.all([getTranslations("Tables"), getRequestOrigin()]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
              <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("backToDashboard")}
            </Link>
            <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
          </div>
          {list.value.length > 0 && (
            <Link href={`/${locale}/staff/tables/print`} className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-gray-700">
              {t("printAll")}
            </Link>
          )}
        </header>

        <p className="text-gray-600">{t("intro")}</p>
        {!restaurant.settings.dineInEnabled && (
          <p role="note" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("dineInOff")}
          </p>
        )}

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="mb-3 text-lg font-semibold">{t("addTitle")}</h2>
          <AddTableForm action={addTableAction.bind(null, locale)} />
        </section>

        {list.value.length === 0 ? (
          <p className="py-6 text-center text-gray-500">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            {list.value.map((table) => (
              <TableCardRow
                key={table.id}
                table={{
                  id: table.id,
                  label: table.label,
                  isActive: table.isActive,
                  scanUrl: tableScanUrl(origin, table.token),
                  rename: renameTableAction.bind(null, locale, table.id),
                  setActive: setTableActiveAction.bind(null, locale, table.id),
                  regenerate: regenerateTableTokenAction.bind(null, locale, table.id),
                  remove: deleteTableAction.bind(null, locale, table.id),
                  printHref: `/${locale}/staff/tables/print?table=${table.id}`,
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
