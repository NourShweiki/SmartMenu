import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { filsToPriceInput } from "@/interface/web/price-input";
import { saveItemAction } from "@/interface/web/staff/item-actions";
import { ItemForm } from "@/interface/web/staff/item-form";
import { categoryOptions, ItemFormShell, loadMenuForEditing } from "@/interface/web/staff/item-form-page";

export default async function EditItemPage({ params }: { params: Promise<{ locale: string; itemId: string }> }) {
  const locale = await initLocale(params);
  const { itemId } = await params;
  const { restaurant, staffMenu } = await loadMenuForEditing(locale);
  const t = await getTranslations("ItemForm");

  // Only this restaurant's live items are in the staff menu, so another restaurant's id 404s.
  const item = staffMenu.sections.flatMap((s) => s.items).find((i) => i.id === itemId);
  if (!item) notFound();

  return (
    <ItemFormShell locale={locale} restaurant={restaurant} title={t("titleEdit")}>
      <ItemForm
        action={saveItemAction.bind(null, locale, { kind: "edit", itemId: item.id, sortOrder: item.sortOrder })}
        initial={{
          categoryId: item.categoryId,
          nameAr: item.name.ar,
          nameEn: item.name.en,
          descriptionAr: item.description.ar,
          descriptionEn: item.description.en,
          price: filsToPriceInput(item.priceFils),
        }}
        categories={categoryOptions(staffMenu, locale)}
        cancelHref={`/${locale}/staff/menu`}
      />
    </ItemFormShell>
  );
}
