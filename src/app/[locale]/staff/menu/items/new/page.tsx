import { getTranslations } from "next-intl/server";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { saveItemAction } from "@/interface/web/staff/item-actions";
import { ItemForm } from "@/interface/web/staff/item-form";
import { categoryOptions, ItemFormShell, loadMenuForEditing } from "@/interface/web/staff/item-form-page";

export default async function NewItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const locale = await initLocale(params);
  const { restaurant, staffMenu } = await loadMenuForEditing(locale);
  const t = await getTranslations("ItemForm");

  // Preselect the category the "Add item" button belongs to; new items go to its end.
  const requested = (await searchParams).category;
  const section = staffMenu.sections.find((s) => s.category.id === requested) ?? staffMenu.sections[0];
  const sortOrder = section ? Math.max(-1, ...section.items.map((i) => i.sortOrder)) + 1 : 0;

  return (
    <ItemFormShell locale={locale} restaurant={restaurant} title={t("titleNew")}>
      <ItemForm
        action={saveItemAction.bind(null, locale, { kind: "new", sortOrder })}
        initial={{ categoryId: section?.category.id ?? "", nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "", price: "" }}
        categories={categoryOptions(staffMenu, locale)}
        cancelHref={`/${locale}/staff/menu`}
      />
    </ItemFormShell>
  );
}
