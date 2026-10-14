import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { accentHex } from "@/domain/restaurant/branding";
import { localized } from "@/domain/shared/localized";
import { isOrderingAssistantAvailable, logoUrl, tableSessions } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { resolveVisit } from "@/interface/web/customer/ordering-mode";
import { readSessionId } from "@/interface/web/customer/session-cookie";
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

  const { name, branding, settings, slug } = site.restaurant;
  const other = otherLocale(locale);
  const { tagline, about, address, hours, phone, phoneHref, hasDetails } = publicDetails(branding, locale);

  // What this phone can do here decides which options are offered (same rules as the menu page, see resolveVisit):
  //  - the smart assistant: an AI key is configured and something can be ordered;
  //  - the menu: always;
  //  - services (waiter, cleaning, bill): only where there are tables (dine-in on); a guest who has not scanned a table is told to.
  const sessionId = await readSessionId();
  const session = sessionId ? await tableSessions.find({ slug, sessionId }) : null;
  const { atTable, ordering } = resolveVisit(settings, session);
  const showAssistant = ordering !== "none" && isOrderingAssistantAvailable();
  const showServices = settings.dineInEnabled;
  const accent = accentHex(branding.accent);

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
        {/* The three ways in. The smart assistant comes first and is the filled one: it is the easiest way to order. */}
        <nav aria-label={t("optionsLabel")}>
          <ul className="flex flex-col gap-4">
            {showAssistant && (
              <li>
                <Link
                  href={`/${locale}/menu?assistant=1`}
                  className="flex items-center justify-between gap-4 rounded-2xl px-5 py-5 text-white hover:opacity-90"
                  style={{ backgroundColor: accent }}
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-xl font-semibold">{t("options.assistant.title")}</span>
                    <span className="text-sm text-white/85">{t("options.assistant.description")}</span>
                  </span>
                  <span aria-hidden className="text-2xl rtl:-scale-x-100">→</span>
                </Link>
              </li>
            )}
            <li>
              <Link
                href={`/${locale}/menu`}
                className="flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-5 ring-2 hover:bg-gray-50"
                style={{ color: accent, ["--tw-ring-color" as string]: accent }}
              >
                <span className="flex flex-col gap-1">
                  <span className="text-xl font-semibold">{t("options.menu.title")}</span>
                  <span className="text-sm text-gray-600">{t("options.menu.description")}</span>
                </span>
                <span aria-hidden className="text-2xl rtl:-scale-x-100">→</span>
              </Link>
            </li>
            {showServices && (
              <li>
                <Link
                  href={`/${locale}/services`}
                  className="flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-5 ring-2 hover:bg-gray-50"
                  style={{ color: accent, ["--tw-ring-color" as string]: accent }}
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-xl font-semibold">{t("options.services.title")}</span>
                    <span className="text-sm text-gray-600">{t("options.services.description")}</span>
                    {!atTable && <span className="text-sm font-medium text-amber-800">{t("options.services.needTable")}</span>}
                  </span>
                  <span aria-hidden className="text-2xl rtl:-scale-x-100">→</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>
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
