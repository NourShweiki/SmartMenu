import { getTranslations } from "next-intl/server";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { saveCategoryAction } from "@/interface/web/staff/category-actions";
import { CategoryForm } from "@/interface/web/staff/category-form";
import { ItemFormShell, loadMenuForEditing } from "@/interface/web/staff/item-form-page";

export default async function NewCategoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await initLocale(params);
  const { restaurant, staffMenu } = await loadMenuForEditing(locale);
  const t = await getTranslations("CategoryForm");
  // New categories go to the end of the menu.
  const sortOrder = Math.max(-1, ...staffMenu.sections.map((s) => s.category.sortOrder)) + 1;

  return (
    <ItemFormShell locale={locale} restaurant={restaurant} title={t("titleNew")}>
      <CategoryForm
        action={saveCategoryAction.bind(null, locale, { kind: "new", sortOrder })}
        initial={{ nameAr: "", nameEn: "" }}
        cancelHref={`/${locale}/staff/menu`}
      />
    </ItemFormShell>
  );
}
