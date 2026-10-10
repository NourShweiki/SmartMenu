import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";

// Where a QR code that is not valid lands: an unknown or made-up code, a table that is switched off or deleted, or a
// restaurant with dine-in turned off. Deliberately the same page for all of them, so it reveals nothing about which.
export default async function ScanInvalidPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") notFound();
  const t = await getTranslations("Table");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-gray-500">{localized(site.restaurant.name, locale)}</p>
        <h1 className="text-2xl font-semibold">{t("invalidTitle")}</h1>
      </div>
      <p className="max-w-sm text-gray-600">{t("invalidBody")}</p>
      <Link href={`/${locale}/menu`} className="rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-gray-700">
        {t("viewMenu")}
      </Link>
      <LanguageSwitch locale={locale} path="/scan-invalid" />
    </main>
  );
}
