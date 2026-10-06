import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { otherLocale } from "@/interface/web/i18n/locales";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const t = await getTranslations("Home");
  const site = await getCurrentSite();

  if (site.kind === "platform") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">{t("platformName")}</h1>
        <LanguageSwitch locale={locale} />
      </main>
    );
  }

  if (site.kind === "unknown") notFound();

  const { name } = site.restaurant;
  const other = otherLocale(locale);

  // Restaurant content comes from the _ar/_en columns; UI text comes from messages/*.json.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-4xl font-semibold">{localized(name, locale)}</h1>
      <p className="text-lg text-gray-500">
        <bdi lang={other}>{localized(name, other)}</bdi>
      </p>
      <div className="mt-6">
        <LanguageSwitch locale={locale} />
      </div>
    </main>
  );
}
