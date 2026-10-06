import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { deleteCategoryAction, saveCategoryAction } from "@/interface/web/staff/category-actions";
import { CategoryForm, DeleteCategory } from "@/interface/web/staff/category-form";
import { ItemFormShell, loadMenuForEditing } from "@/interface/web/staff/item-form-page";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; categoryId: string }>;
}) {
  const locale = await initLocale(params);
  const { categoryId } = await params;
  const { restaurant, staffMenu } = await loadMenuForEditing(locale);
  const t = await getTranslations("CategoryForm");

  // Only this restaurant's live categories are in the staff menu, so anything else 404s.
  const section = staffMenu.sections.find((s) => s.category.id === categoryId);
  if (!section) notFound();
  const { category, items } = section;

  return (
    <ItemFormShell locale={locale} restaurant={restaurant} title={t("titleEdit")}>
      <CategoryForm
        action={saveCategoryAction.bind(null, locale, {
          kind: "edit",
          categoryId: category.id,
          sortOrder: category.sortOrder,
        })}
        initial={{ nameAr: category.name.ar, nameEn: category.name.en }}
        cancelHref={`/${locale}/staff/menu`}
      />
      <hr className="my-6 border-gray-100" />
      <DeleteCategory action={deleteCategoryAction.bind(null, locale, category.id)} itemCount={items.length} />
    </ItemFormShell>
  );
}
