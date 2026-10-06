import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { getStaffContext } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { signOutAction } from "@/interface/web/staff/actions";

// Placeholder staff home: proves sign-in, role and sign-out work end to end.
export default async function StaffHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") notFound();

  const staff = await getStaffContext({ restaurantId: site.restaurant.id });
  if (!staff.ok) redirect(`/${locale}/staff/login`);

  const t = await getTranslations("StaffHome");
  const roles = await getTranslations("Roles");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{localized(site.restaurant.name, locale)}</p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <LanguageSwitch locale={locale} path="/staff" />
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <p className="text-sm text-gray-500">{t("yourRole")}</p>
        <p className="text-xl font-semibold">{roles(staff.value.role)}</p>
        <p className="mt-4 text-gray-600">{t("comingSoon")}</p>
      </section>

      <form action={signOutAction.bind(null, locale)}>
        <button type="submit" className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100">
          {t("signOut")}
        </button>
      </form>
    </main>
  );
}
