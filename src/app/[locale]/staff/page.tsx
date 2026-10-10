import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can } from "@/domain/restaurant/role";
import { localized } from "@/domain/shared/localized";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { signOutAction } from "@/interface/web/staff/actions";
import { requireStaff } from "@/interface/web/staff/require-staff";

// Staff home: who you are here, and links to the staff screens.
export default async function StaffHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  const t = await getTranslations("StaffHome");
  const roles = await getTranslations("Roles");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
          </div>
          <LanguageSwitch locale={locale} path="/staff" />
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <p className="text-sm text-gray-500">{t("yourRole")}</p>
          <p className="text-xl font-semibold">{roles(staff.role)}</p>
        </section>

        <Link
          href={`/${locale}/staff/menu`}
          className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 hover:ring-gray-400"
        >
          <span>
            <span className="block text-lg font-semibold">{t("menuLink")}</span>
            <span className="block text-sm text-gray-500">{t("menuLinkHint")}</span>
          </span>
          <span aria-hidden className="inline-block text-xl text-gray-400 rtl:-scale-x-100">→</span>
        </Link>

        {can(staff.role, "tables:manage") && (
          <Link
            href={`/${locale}/staff/tables`}
            className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 hover:ring-gray-400"
          >
            <span>
              <span className="block text-lg font-semibold">{t("tablesLink")}</span>
              <span className="block text-sm text-gray-500">{t("tablesLinkHint")}</span>
            </span>
            <span aria-hidden className="inline-block text-xl text-gray-400 rtl:-scale-x-100">→</span>
          </Link>
        )}

        {can(staff.role, "restaurant:settings") && (
          <Link
            href={`/${locale}/staff/settings`}
            className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 hover:ring-gray-400"
          >
            <span>
              <span className="block text-lg font-semibold">{t("settingsLink")}</span>
              <span className="block text-sm text-gray-500">{t("settingsLinkHint")}</span>
            </span>
            <span aria-hidden className="inline-block text-xl text-gray-400 rtl:-scale-x-100">→</span>
          </Link>
        )}

        {can(staff.role, "restaurant:settings") && (
          <Link
            href={`/${locale}/staff/branding`}
            className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 hover:ring-gray-400"
          >
            <span>
              <span className="block text-lg font-semibold">{t("brandingLink")}</span>
              <span className="block text-sm text-gray-500">{t("brandingLinkHint")}</span>
            </span>
            <span aria-hidden className="inline-block text-xl text-gray-400 rtl:-scale-x-100">→</span>
          </Link>
        )}

        <form action={signOutAction.bind(null, locale)}>
          <button type="submit" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-100">
            {t("signOut")}
          </button>
        </form>
      </div>
    </main>
  );
}
