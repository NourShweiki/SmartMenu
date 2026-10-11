import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { platform } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { signInFounderAction } from "@/interface/web/setup/actions";
import { LoginForm } from "@/interface/web/staff/login-form";

export default async function SetupLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const site = await getCurrentSite();
  if (site.kind !== "platform") notFound(); // the setup tool is not part of any restaurant's site

  if ((await platform.founder()).ok) redirect(`/${locale}/setup`);

  const t = await getTranslations("Setup");
  const tHome = await getTranslations("Home");
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <p className="text-sm text-gray-500">{tHome("platformName")}</p>
        <h1 className="mb-6 text-2xl font-semibold">{t("loginTitle")}</h1>
        <LoginForm action={signInFounderAction.bind(null, locale)} />
        <div className="mt-6 flex justify-center">
          <LanguageSwitch locale={locale} path="/setup/login" />
        </div>
      </div>
    </main>
  );
}
