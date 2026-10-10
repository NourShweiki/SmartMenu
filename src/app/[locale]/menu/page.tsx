import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { accentHex } from "@/domain/restaurant/branding";
import { localized } from "@/domain/shared/localized";
import { getPublicMenu, menuPhotoUrls, tableSessions } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { CustomerMenu } from "@/interface/web/customer/customer-menu";
import { readSessionId } from "@/interface/web/customer/session-cookie";
import { getCurrentSite } from "@/interface/web/current-site";
import { initLocale } from "@/interface/web/i18n/init-locale";

// The customer-facing menu of a restaurant (public: no login). Restaurant from the host, menu from the public read path.
export default async function CustomerMenuPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const site = await getCurrentSite();
  if (site.kind !== "restaurant") notFound();
  const { restaurant } = site;

  const sessionId = await readSessionId(); // set by the server when a table QR code was scanned
  const [menu, t, session] = await Promise.all([
    getPublicMenu({ id: restaurant.id, slug: restaurant.slug }),
    getTranslations("Menu"),
    sessionId ? tableSessions.find({ slug: restaurant.slug, sessionId }) : null,
  ]);
  // The table is whatever the database says now: a session that was closed (the guests left) shows no table.
  const table = session && session.status !== "CLOSED" ? { label: session.tableLabel } : null;
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
        <div className="rounded-full bg-white text-gray-900">
          <LanguageSwitch locale={locale} path="/menu" />
        </div>
      </header>

      <CustomerMenu
        restaurantSlug={restaurant.slug}
        sections={menu.sections}
        rates={{ taxRateBp: restaurant.settings.taxRateBp, serviceChargeBp: restaurant.settings.serviceChargeBp }}
        imageUrls={imageUrls}
        table={table}
      />
    </main>
  );
}
