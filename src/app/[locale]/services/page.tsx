import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { accentHex } from "@/domain/restaurant/branding";
import { localized } from "@/domain/shared/localized";
import { serviceRequests, tableSessions } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { LiveRefresh } from "@/interface/web/components/live-refresh";
import { ServicesPanel } from "@/interface/web/customer/services-panel";
import { readSessionId } from "@/interface/web/customer/session-cookie";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";

// Services for a guest at a table: call the waiter, have the table cleaned, ask for the bill. Public (no login): the
// restaurant comes from the host, the visit from the HttpOnly cookie the table's QR code scan set. Without a table
// visit (nothing scanned, a takeout visit, or one that has ended) there is nothing to serve: the page says to scan.
export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") notFound();
  const { restaurant } = site;
  const [t, tTable] = await Promise.all([getTranslations("Services"), getTranslations("Table")]);

  const sessionId = await readSessionId();
  const session = sessionId ? await tableSessions.find({ slug: restaurant.slug, sessionId }) : null;
  const atTable = session && session.kind === "TABLE" && session.status !== "CLOSED" ? session : null;
  const services = atTable && sessionId ? await serviceRequests.forGuest({ slug: restaurant.slug, sessionId }) : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-white" style={{ backgroundColor: accentHex(restaurant.branding.accent) }}>
        <div>
          <Link href={`/${locale}/menu`} className="text-sm text-white/80 hover:text-white">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("toMenu")}
          </Link>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-white/80">{localized(restaurant.name, locale)}</p>
        </div>
        <div className="rounded-full bg-white text-gray-900">
          <LanguageSwitch locale={locale} path="/services" />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        {atTable && atTable.kind === "TABLE" && services ? (
          <>
            <p role="status" className="rounded-xl bg-white px-4 py-3 text-center font-semibold ring-1 ring-gray-200">
              <bdi>{tTable("banner", { label: atTable.tableLabel })}</bdi>
            </p>
            <p className="text-center text-sm text-gray-600">{t("intro")}</p>
            <ServicesPanel requests={services.requests} billOnItsWay={atTable.status === "PAYMENT_REQUESTED"} />
            {/* While something is waiting, the page asks again every few seconds, so it turns into "done" by itself. */}
            {services.waiting.length > 0 && <LiveRefresh everyMs={8000} />}
          </>
        ) : (
          <section className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold">{t("needTableTitle")}</h2>
            <p className="text-gray-600">{t("needTable")}</p>
            <Link href={`/${locale}/menu`} className="rounded-lg bg-gray-900 px-4 py-2.5 font-semibold text-white hover:bg-gray-700">
              {t("toMenu")}
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
