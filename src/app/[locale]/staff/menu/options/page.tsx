import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localized } from "@/domain/shared/localized";
import { formatPrice } from "@/interface/web/format";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { ItemFormShell } from "@/interface/web/staff/item-form-page";
import { loadOptionsForEditing, ruleSummaries } from "@/interface/web/staff/options-page";

export default async function OptionGroupsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, groups } = await loadOptionsForEditing(locale);
  const t = await getTranslations("Options");
  const rule = await ruleSummaries();

  return (
    <ItemFormShell locale={locale} restaurant={restaurant} title={t("title")}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-gray-600">{t("intro")}</p>
        <div>
          <Link
            href={`/${locale}/staff/menu/options/new`}
            className="inline-block rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            + {t("addGroup")}
          </Link>
        </div>

        {groups.length === 0 && <p className="text-gray-500">{t("noGroupsYet")}</p>}

        <ul className="flex flex-col gap-3">
          {groups.map(({ group, options, itemIds }) => (
            <li key={group.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{localized(group.name, locale)}</p>
                  <p className="text-sm text-gray-500">
                    {rule(group)} · {t("usedBy", { count: itemIds.length })}
                  </p>
                </div>
                <Link
                  href={`/${locale}/staff/menu/options/${group.id}`}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-100"
                >
                  {t("edit")}
                </Link>
              </div>
              {options.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {options.map((o) => (
                    <li key={o.id} className="rounded-full bg-gray-100 px-3 py-1 text-sm">
                      {localized(o.name, locale)}
                      {o.priceDeltaFils > 0 && (
                        <span className="ms-1 text-gray-600">
                          <bdi>+{formatPrice(o.priceDeltaFils, locale)}</bdi>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-amber-700">{t("noOptionsYet")}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </ItemFormShell>
  );
}
