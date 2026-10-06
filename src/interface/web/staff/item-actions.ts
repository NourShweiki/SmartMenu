"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MenuUseCaseError } from "@/application/use-cases/menu/shared";
import type { CategoryId, MenuItemId } from "@/domain/menu/menu";
import { menu } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { parsePriceInput } from "@/interface/web/price-input";
import { requireStaff } from "./require-staff";

export type ItemField = "categoryId" | "nameAr" | "nameEn" | "descriptionAr" | "descriptionEn" | "price";
export type ItemFormValues = Record<ItemField, string>;
/** Error keys map to messages in ItemForm.errors.* */
export type ItemFormError = "required" | "tooLong" | "invalidPrice" | "categoryNotFound";
export type ItemFormState = {
  values?: ItemFormValues;
  errors?: Partial<Record<ItemField, ItemFormError>>;
  /** Not tied to one field (no permission, item gone). */
  formError?: "forbidden" | "notFound";
};

/** `new` items go to the end of their category; edits keep their position. */
export type ItemFormMode = { kind: "new"; sortOrder: number } | { kind: "edit"; itemId: string; sortOrder: number };

const FIELDS: ItemField[] = ["categoryId", "nameAr", "nameEn", "descriptionAr", "descriptionEn", "price"];

function read(form: FormData): ItemFormValues {
  return Object.fromEntries(
    FIELDS.map((f) => {
      const v = form.get(f);
      return [f, typeof v === "string" ? v.slice(0, 2000) : ""];
    }),
  ) as ItemFormValues;
}

/** Domain/use-case errors -> which field shows which message. */
function toFormState(values: ItemFormValues, error: MenuUseCaseError): ItemFormState {
  const lang = (l: "en" | "ar") => (l === "ar" ? "Ar" : "En");
  switch (error.type) {
    case "NAME_REQUIRED":
      return { values, errors: { [`name${lang(error.lang)}`]: "required" } };
    case "NAME_TOO_LONG":
      return { values, errors: { [`name${lang(error.lang)}`]: "tooLong" } };
    case "DESCRIPTION_TOO_LONG":
      return { values, errors: { [`description${lang(error.lang)}`]: "tooLong" } };
    case "INVALID_PRICE":
      return { values, errors: { price: "invalidPrice" } };
    case "CATEGORY_NOT_FOUND":
      return { values, errors: { categoryId: "categoryNotFound" } };
    case "FORBIDDEN":
      return { values, formError: "forbidden" };
    case "ITEM_NOT_FOUND":
    case "DELETED":
    case "INVALID_SORT_ORDER":
    case "CATEGORY_NOT_EMPTY": // only from category deletes; can't happen when saving an item
      return { values, formError: "notFound" };
  }
}

export async function saveItemAction(
  locale: string,
  mode: ItemFormMode,
  _prev: ItemFormState,
  form: FormData,
): Promise<ItemFormState> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l); // restaurant + role from host + session, never from the form
  const actor = { restaurantId: staff.restaurantId, role: staff.role };
  const values = read(form);

  const priceFils = parsePriceInput(values.price);
  if (priceFils === null) return { values, errors: { price: values.price.trim() ? "invalidPrice" : "required" } };

  const input = {
    categoryId: values.categoryId as CategoryId,
    name: { en: values.nameEn, ar: values.nameAr },
    description: { en: values.descriptionEn, ar: values.descriptionAr },
    priceFils,
    sortOrder: mode.sortOrder,
  };
  const result =
    mode.kind === "new"
      ? await menu.addItem(actor, input)
      : await menu.editItem(actor, { ...input, itemId: mode.itemId as MenuItemId });
  if (!result.ok) return toFormState(values, result.error);

  revalidatePath(`/${l}/staff/menu`);
  redirect(`/${l}/staff/menu`);
}

/** Soft-deletes an item (asked to confirm in the browser first), then back to the menu. */
export async function deleteItemAction(locale: string, itemId: string): Promise<void> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  await menu.deleteItem({ restaurantId: staff.restaurantId, role: staff.role }, { itemId: itemId as MenuItemId });
  revalidatePath(`/${l}/staff/menu`);
  redirect(`/${l}/staff/menu`);
}
