import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MAX_IMPORT_ROWS } from "@/application/use-cases/menu/import-menu";
import { can } from "@/domain/restaurant/role";
import { localized } from "@/domain/shared/localized";
import { menuDraftAvailable } from "@/infrastructure/container";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { menuImportAction } from "@/interface/web/staff/menu-import-actions";
import { MenuImportForm } from "@/interface/web/staff/menu-import-form";
import { IMPORT_COLUMNS } from "@/interface/web/staff/menu-import-model";
import { requireStaff } from "@/interface/web/staff/require-staff";

// Many items at once from a spreadsheet (owner and manager: `menu:manage`): upload a CSV file, check the preview,
// import. The file format is explained on the page, with a template to start from.
export default async function MenuImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  if (!can(staff.role, "menu:manage")) notFound();
  const t = await getTranslations("MenuImport");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <header>
          <Link href={`/${locale}/staff/menu`} className="text-sm text-gray-500 hover:text-gray-900">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("back")}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
        </header>

        <section className="flex flex-col gap-2 rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-gray-200">
          <p>{t("howTo")}</p>
          <p>
            {t("columnsIntro")} <bdi dir="ltr" className="font-mono text-xs">{IMPORT_COLUMNS.join(", ")}</bdi>
          </p>
          <ul className="list-disc ps-5 text-gray-600">
            <li>{t("rules.names")}</li>
            <li>{t("rules.price")}</li>
            <li>{t("rules.existing")}</li>
            <li>{t("rules.limit", { max: MAX_IMPORT_ROWS })}</li>
            <li>{t("rules.csv")}</li>
          </ul>
          <p>
            <a href="/menu-import-template.csv" download className="font-semibold underline">
              {t("template")}
            </a>
          </p>
        </section>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <MenuImportForm action={menuImportAction.bind(null, locale)} aiAvailable={menuDraftAvailable()} />
        </div>
      </div>
    </main>
  );
}
