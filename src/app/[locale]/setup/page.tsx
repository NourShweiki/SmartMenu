import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { presetSettings, type BusinessType } from "@/domain/restaurant/settings";
import { localized } from "@/domain/shared/localized";
import { appRootDomain, platform } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { restaurantOrigin } from "@/interface/web/current-site";
import { formatDayTime } from "@/interface/web/format";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { otherLocale } from "@/interface/web/i18n/locales";
import { bpToRateInput } from "@/interface/web/rate-input";
import { createRestaurantAction, issueOwnerPasswordAction, signOutFounderAction } from "@/interface/web/setup/actions";
import { NewRestaurantForm } from "@/interface/web/setup/new-restaurant-form";
import { OwnerPassword } from "@/interface/web/setup/owner-password";
import { requireFounder } from "@/interface/web/setup/require-founder";

const presetRates = (type: BusinessType) => {
  const preset = presetSettings(type);
  return { tax: bpToRateInput(preset.taxRateBp), service: bpToRateInput(preset.serviceChargeBp) };
};

// The founders' setup tool: the form that creates a new restaurant, and every restaurant on the platform with its
// owner(s), who can be given a new temporary password from here.
export default async function SetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  await requireFounder(locale);
  const restaurants = await platform.listRestaurants();
  if (!restaurants.ok) notFound();

  const t = await getTranslations("Setup");
  const other = otherLocale(locale);
  const rows = await Promise.all(restaurants.value.map(async (restaurant) => ({ ...restaurant, origin: await restaurantOrigin(restaurant.slug) })));

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-gray-500">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitch locale={locale} path="/setup" />
            <form action={signOutFounderAction.bind(null, locale)}>
              <button type="submit" className="rounded-full border border-gray-300 px-4 py-1 text-sm hover:bg-gray-100">
                {t("signOut")}
              </button>
            </form>
          </div>
        </header>

        <section aria-labelledby="new-restaurant" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 id="new-restaurant" className="mb-4 text-lg font-semibold">
            {t("newTitle")}
          </h2>
          <NewRestaurantForm
            action={createRestaurantAction.bind(null, locale)}
            initialId={crypto.randomUUID()}
            rootDomain={appRootDomain()}
            presets={{ "dine-in": presetRates("dine-in"), takeout: presetRates("takeout") }}
          />
        </section>

        <section aria-labelledby="restaurants" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 id="restaurants" className="mb-2 text-lg font-semibold">
            {t("listTitle", { count: rows.length })}
          </h2>
          <ul className="divide-y divide-gray-100">
            {rows.map((restaurant) => (
              <li key={restaurant.id} aria-label={localized(restaurant.name, locale)} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div>
                    <p className="font-semibold">{localized(restaurant.name, locale)}</p>
                    <p className="text-sm text-gray-500">
                      <bdi lang={other}>{localized(restaurant.name, other)}</bdi>
                    </p>
                  </div>
                  <div className="text-end text-sm">
                    <a href={`${restaurant.origin}/${locale}`} target="_blank" rel="noreferrer" className="underline">
                      <bdi dir="ltr">{restaurant.origin.replace(/^https?:\/\//, "")}</bdi>
                    </a>
                    <p className="text-gray-500">
                      {t("createdOn")} <bdi>{formatDayTime(restaurant.createdAt, locale)}</bdi>
                    </p>
                  </div>
                </div>
                {restaurant.owners.length === 0 && <p className="text-sm text-amber-800">{t("noOwner")}</p>}
                {restaurant.owners.map((owner) => (
                  <OwnerPassword key={owner.userId} email={owner.email} action={issueOwnerPasswordAction.bind(null, locale, restaurant.id, owner.userId)} />
                ))}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
