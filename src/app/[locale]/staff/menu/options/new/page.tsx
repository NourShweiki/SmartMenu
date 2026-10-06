import { getTranslations } from "next-intl/server";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { ItemFormShell } from "@/interface/web/staff/item-form-page";
import { saveGroupAction } from "@/interface/web/staff/option-actions";
import { OptionGroupForm } from "@/interface/web/staff/option-forms";
import { loadOptionsForEditing } from "@/interface/web/staff/options-page";

export default async function NewOptionGroupPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, groups } = await loadOptionsForEditing(locale);
  const t = await getTranslations("Options");
  const sortOrder = Math.max(-1, ...groups.map((g) => g.group.sortOrder)) + 1;

  return (
    <ItemFormShell locale={locale} restaurant={restaurant} title={t("newGroup")}>
      <OptionGroupForm
        action={saveGroupAction.bind(null, locale, { kind: "new", sortOrder })}
        // Most common: "pick exactly one" (e.g. size). Owners change it for extras.
        initial={{ nameAr: "", nameEn: "", minSelect: "1", maxSelect: "1" }}
        cancelHref={`/${locale}/staff/menu/options`}
      />
    </ItemFormShell>
  );
}
