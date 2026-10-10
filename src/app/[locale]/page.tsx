import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { accentHex } from "@/domain/restaurant/branding";
import { localized } from "@/domain/shared/localized";
import { logoUrl } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { otherLocale } from "@/interface/web/i18n/locales";
import { publicDetails } from "@/interface/web/public-restaurant-view";

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

  const { name, branding } = site.restaurant;
  const other = otherLocale(locale);
  const { tagline, about, address, hours, phone, phoneHref, hasDetails } = publicDetails(branding, locale);

  // Restaurant content comes from the _ar/_en columns and the branding; UI text comes from messages/*.json.
  // The accent colour is one of the palette's, all readable with white text (domain/restaurant/branding.ts).
  return (
    <main className="min-h-screen bg-white">
      <header
        className="flex flex-col items-center gap-3 px-6 py-12 text-center text-white"
        style={{ backgroundColor: accentHex(branding.accent) }}
      >
        {branding.logoPath && (
          <Image
            src={logoUrl(branding.logoPath)}
            alt={localized(name, locale)}
            width={112}
            height={112}
            unoptimized
            className="size-28 rounded-2xl bg-white object-contain p-2"
          />
        )}
        <h1 className="text-4xl font-semibold">{localized(name, locale)}</h1>
        <p className="text-lg text-white/80">
          <bdi lang={other}>{localized(name, other)}</bdi>
        </p>
        {tagline && <p className="mt-1 max-w-xl text-lg">{tagline}</p>}
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-10">
        <Link
          href={`/${locale}/menu`}
          className="rounded-xl px-5 py-3 text-center text-lg font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: accentHex(branding.accent) }}
        >
          {t("viewMenu")}
        </Link>
        {hasDetails && (
          <dl className="flex flex-col gap-5">
            {about && (
              <div>
                <dt className="text-sm font-semibold text-gray-500">{t("about")}</dt>
                <dd className="mt-1 whitespace-pre-line">{about}</dd>
              </div>
            )}
            {address && (
              <div>
                <dt className="text-sm font-semibold text-gray-500">{t("address")}</dt>
                <dd className="mt-1 whitespace-pre-line">{address}</dd>
              </div>
            )}
            {phoneHref && (
              <div>
                <dt className="text-sm font-semibold text-gray-500">{t("phone")}</dt>
                <dd className="mt-1">
                  <a href={phoneHref} className="underline">
                    <bdi dir="ltr">{phone}</bdi>
                  </a>
                </dd>
              </div>
            )}
            {hours && (
              <div>
                <dt className="text-sm font-semibold text-gray-500">{t("hours")}</dt>
                <dd className="mt-1 whitespace-pre-line">{hours}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="flex justify-center">
          <LanguageSwitch locale={locale} />
        </div>
      </div>
    </main>
  );
}
