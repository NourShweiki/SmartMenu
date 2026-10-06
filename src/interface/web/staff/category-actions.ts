"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MenuUseCaseError } from "@/application/use-cases/menu/shared";
import type { CategoryId } from "@/domain/menu/menu";
import { menu } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";

export type CategoryField = "nameAr" | "nameEn";
export type CategoryFormValues = Record<CategoryField, string>;
export type CategoryFormState = {
  values?: CategoryFormValues;
  errors?: Partial<Record<CategoryField, "required" | "tooLong">>;
  formError?: "forbidden" | "notFound" | "notEmpty";
};
/** New categories go to the end of the menu; edits keep their position. */
export type CategoryFormMode = { kind: "new"; sortOrder: number } | { kind: "edit"; categoryId: string; sortOrder: number };

async function context(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l); // restaurant + role from host + session, never from the form
  return { locale: l, actor: { restaurantId: staff.restaurantId, role: staff.role } };
}

function toFormState(values: CategoryFormValues | undefined, error: MenuUseCaseError): CategoryFormState {
  const field = (lang: "en" | "ar"): CategoryField => (lang === "ar" ? "nameAr" : "nameEn");
  switch (error.type) {
    case "NAME_REQUIRED":
      return { values, errors: { [field(error.lang)]: "required" } };
    case "NAME_TOO_LONG":
      return { values, errors: { [field(error.lang)]: "tooLong" } };
    case "FORBIDDEN":
      return { values, formError: "forbidden" };
    case "CATEGORY_NOT_EMPTY":
      return { values, formError: "notEmpty" };
    default:
      return { values, formError: "notFound" };
  }
}

export async function saveCategoryAction(
  locale: string,
  mode: CategoryFormMode,
  _prev: CategoryFormState,
  form: FormData,
): Promise<CategoryFormState> {
  const ctx = await context(locale);
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.slice(0, 500) : "";
  };
  const values = { nameAr: str("nameAr"), nameEn: str("nameEn") };
  const input = { name: { ar: values.nameAr, en: values.nameEn }, sortOrder: mode.sortOrder };

  const result =
    mode.kind === "new"
      ? await menu.addCategory(ctx.actor, input)
      : await menu.editCategory(ctx.actor, { ...input, categoryId: mode.categoryId as CategoryId });
  if (!result.ok) return toFormState(values, result.error);

  revalidatePath(`/${ctx.locale}/staff/menu`);
  redirect(`/${ctx.locale}/staff/menu`);
}

export async function setCategoryHiddenAction(locale: string, categoryId: string, isHidden: boolean): Promise<void> {
  const ctx = await context(locale);
  await menu.setCategoryHidden(ctx.actor, { categoryId: categoryId as CategoryId, isHidden });
  revalidatePath(`/${ctx.locale}/staff/menu`);
}

/** Only empty categories can be deleted; otherwise the form shows "move or delete its items first". */
export async function deleteCategoryAction(locale: string, categoryId: string): Promise<CategoryFormState> {
  const ctx = await context(locale);
  const result = await menu.deleteCategory(ctx.actor, { categoryId: categoryId as CategoryId });
  if (!result.ok) return toFormState(undefined, result.error);
  revalidatePath(`/${ctx.locale}/staff/menu`);
  redirect(`/${ctx.locale}/staff/menu`);
}
