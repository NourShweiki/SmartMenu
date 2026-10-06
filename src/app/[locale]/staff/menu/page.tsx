import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { menu } from "@/infrastructure/container";
import { LanguageSwitch } from "@/interface/web/components/language-switch";
import { formatPrice } from "@/interface/web/format";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { otherLocale } from "@/interface/web/i18n/locales";
import { setHiddenAction, setSoldOutAction } from "@/interface/web/staff/menu-actions";
import { requireStaff } from "@/interface/web/staff/require-staff";

const badge = "rounded-full px-2 py-0.5 text-xs font-semibold";
const toggle = "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors";

export default async function StaffMenuPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staff } = await requireStaff(locale);
  const t = await getTranslations("StaffMenu");
  const { sections, canManage, canToggleSoldOut } = await menu.getStaffMenu({
    restaurantId: staff.restaurantId,
    role: staff.role,
  });
  const other = otherLocale(locale);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/${locale}/staff`} className="text-sm text-gray-500 hover:text-gray-900">
              <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("back")}
            </Link>
            <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-gray-500">{localized(restaurant.name, locale)}</p>
          </div>
          <LanguageSwitch locale={locale} path="/staff/menu" />
        </header>

        {sections.length === 0 && <p className="text-gray-500">{t("empty")}</p>}

        {sections.map(({ category, items }) => (
          <section key={category.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {localized(category.name, locale)}
                {category.isHidden && <span className={`${badge} bg-gray-100 text-gray-600`}>{t("hidden")}</span>}
              </h2>
              {canManage && (
                <Link
                  href={`/${locale}/staff/menu/items/new?category=${category.id}`}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-700"
                >
                  + {t("addItem")}
                </Link>
              )}
            </div>

            {items.length === 0 && <p className="px-5 py-4 text-sm text-gray-500">{t("categoryEmpty")}</p>}

            <ul className="divide-y divide-gray-100">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 ${item.isHidden ? "opacity-60" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {localized(item.name, locale)}
                      {item.isSoldOut && <span className={`${badge} bg-red-50 text-red-700`}>{t("soldOut")}</span>}
                      {item.isHidden && <span className={`${badge} bg-gray-100 text-gray-600`}>{t("hidden")}</span>}
                    </p>
                    <p className="text-sm text-gray-500">
                      <bdi lang={other}>{localized(item.name, other)}</bdi>
                    </p>
                  </div>

                  <p className="font-semibold tabular-nums">
                    <bdi>{formatPrice(item.priceFils, locale)}</bdi>
                  </p>

                  <div className="flex w-full justify-end gap-2 sm:w-80">
                    {canToggleSoldOut && (
                      <form action={setSoldOutAction.bind(null, locale, item.id, !item.isSoldOut)}>
                        <button
                          type="submit"
                          className={`${toggle} ${
                            item.isSoldOut
                              ? "border-green-600 text-green-700 hover:bg-green-50"
                              : "border-red-300 text-red-700 hover:bg-red-50"
                          }`}
                        >
                          {item.isSoldOut ? t("markAvailable") : t("markSoldOut")}
                        </button>
                      </form>
                    )}
                    {canManage && (
                      <Link
                        href={`/${locale}/staff/menu/items/${item.id}/edit`}
                        className={`${toggle} border-gray-300 text-gray-700 hover:bg-gray-100`}
                      >
                        {t("edit")}
                      </Link>
                    )}
                    {canManage && (
                      <form action={setHiddenAction.bind(null, locale, item.id, !item.isHidden)}>
                        <button type="submit" className={`${toggle} border-gray-300 text-gray-700 hover:bg-gray-100`}>
                          {item.isHidden ? t("show") : t("hide")}
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
