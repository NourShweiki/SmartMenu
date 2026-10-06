import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { getStaffContext } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { signInAction } from "@/interface/web/staff/actions";
import { LoginForm } from "@/interface/web/staff/login-form";

export default async function StaffLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") notFound(); // staff always sign in on their restaurant's site

  const { restaurant } = site;
  if ((await getStaffContext({ restaurantId: restaurant.id })).ok) redirect(`/${locale}/staff`);

  const t = await getTranslations("StaffLogin");
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
        <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>
        <LoginForm action={signInAction.bind(null, locale)} />
        <div className="mt-6 flex justify-center">
          <LanguageSwitch locale={locale} path="/staff/login" />
        </div>
      </div>
    </main>
  );
}
