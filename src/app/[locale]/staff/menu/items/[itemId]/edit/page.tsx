import { notFound } from "next/navigation";
import { localized } from "@/domain/shared/localized";
import { menuPhotoUrl } from "@/infrastructure/container";
import { getTranslations } from "next-intl/server";
import { initLocale } from "@/interface/web/i18n/init-locale";
import { filsToPriceInput } from "@/interface/web/price-input";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";
import { deleteItemAction, saveItemAction } from "@/interface/web/staff/item-actions";
import { ItemForm } from "@/interface/web/staff/item-form";
import { categoryOptions, ItemFormShell, loadMenuForEditing } from "@/interface/web/staff/item-form-page";
import { removePhotoAction, uploadPhotoAction } from "@/interface/web/staff/photo-actions";
import { PhotoUploader } from "@/interface/web/staff/photo-uploader";

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
      <hr className="my-6 border-gray-100" />
      <PhotoUploader
        imageUrl={item.imagePath ? menuPhotoUrl(item.imagePath) : null}
        alt={localized(item.name, locale)}
        upload={uploadPhotoAction.bind(null, locale, item.id)}
        remove={removePhotoAction.bind(null, locale, item.id)}
      />
      <hr className="my-6 border-gray-100" />
      {/* Soft delete: past orders keep their own copy of the name and price. */}
      <form action={deleteItemAction.bind(null, locale, item.id)} className="flex flex-col gap-2">
        <h2 className="font-semibold text-red-700">{t("deleteTitle")}</h2>
        <p className="text-sm text-gray-600">{t("deleteHint")}</p>
        <div>
          <ConfirmSubmit
            question={t("deleteConfirm")}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            {t("delete")}
          </ConfirmSubmit>
        </div>
      </form>
    </ItemFormShell>
  );
}
