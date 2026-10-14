import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { pickupRates } from "@/domain/order/order";
import { accentHex } from "@/domain/restaurant/branding";
import { localized } from "@/domain/shared/localized";
import { getPublicMenu, isOrderingAssistantAvailable, menuPhotoUrls, tableSessions } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { CustomerMenu } from "@/interface/web/customer/customer-menu";
import { resolveVisit } from "@/interface/web/customer/ordering-mode";
import { readSessionId } from "@/interface/web/customer/session-cookie";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";

// The customer-facing menu of a restaurant (public: no login). Restaurant from the host, menu from the public read path.
export default async function CustomerMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ assistant?: string }>;
}) {
  const locale = await initLocale(params);
  const openAssistant = (await searchParams).assistant === "1"; // the home page's "smart assistant" card opens the chat straight away
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") notFound();
  const { restaurant } = site;

  const sessionId = await readSessionId(); // set by the server when a table QR code was scanned
  const [menu, t, session, sessionOrders] = await Promise.all([
    getPublicMenu({ id: restaurant.id, slug: restaurant.slug }),
    getTranslations("Menu"),
    sessionId ? tableSessions.find({ slug: restaurant.slug, sessionId }) : null,
    // The orders of that visit, for "your orders" (the session id in the cookie is what entitles this device to them).
    sessionId ? tableSessions.orders({ slug: restaurant.slug, sessionId }) : [],
  ]);
  // The visit is whatever the database says now: one that was closed (the guests left, the order was collected)
  // counts as none. Which way this phone orders is decided in one place, shared with the home page (see resolveVisit).
  const { settings } = restaurant;
  const { live, atTable, ordering } = resolveVisit(settings, session);
  const visit = !live ? null : atTable ? ({ kind: "TABLE", label: live.kind === "TABLE" ? live.tableLabel : "" } as const) : live.kind === "PICKUP" ? ({ kind: "PICKUP", name: live.customerName } as const) : null;
  const rates = { taxRateBp: settings.taxRateBp, serviceChargeBp: settings.serviceChargeBp };
  const withPhoto = menu.sections.flatMap((s) => s.items.flatMap(({ item }) => (item.imagePath ? [{ id: item.id, path: item.imagePath }] : [])));
  const urls = menuPhotoUrls(withPhoto.map((p) => p.path));
  const imageUrls = Object.fromEntries(withPhoto.map((p, i) => [p.id, urls[i]!]));

  return (
    <main className="min-h-screen bg-gray-50">
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-white"
        style={{ backgroundColor: accentHex(restaurant.branding.accent) }}
      >
        <div>
          <Link href={`/${locale}`} className="text-sm text-white/80 hover:text-white">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {localized(restaurant.name, locale)}
          </Link>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Services (waiter, cleaning, bill) are for guests at a table; until the home page offers them, this is the way in. */}
          {visit?.kind === "TABLE" && (
            <Link href={`/${locale}/services`} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              {t("servicesLink")}
            </Link>
          )}
          <div className="rounded-full bg-white text-gray-900">
            <LanguageSwitch locale={locale} path="/menu" />
          </div>
        </div>
      </header>

      <CustomerMenu
        restaurantSlug={restaurant.slug}
        sections={menu.sections}
        rates={ordering === "table" || ordering === "none" ? rates : pickupRates(rates)} // takeout has no service charge
        imageUrls={imageUrls}
        visit={visit}
        ordering={ordering}
        dineIn={settings.dineInEnabled}
        orders={visit ? sessionOrders : []} // a closed visit shows nothing, and no orders of it either
        restaurantName={localized(restaurant.name, locale)}
        assistantEnabled={ordering !== "none" && isOrderingAssistantAvailable()} // nothing can be ordered here when "none"
        openAssistant={openAssistant}
      />
    </main>
  );
}
