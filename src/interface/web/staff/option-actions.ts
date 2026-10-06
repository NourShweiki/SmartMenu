"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MenuUseCaseError } from "@/application/use-cases/menu/shared";
import type { MenuItemId } from "@/domain/menu/menu";
import type { OptionGroupId, OptionId } from "@/domain/menu/options";
import { options } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { parsePriceInput } from "@/interface/web/price-input";
import { requireStaff } from "./require-staff";

// ─── Shared ─────────────────────────────────────────────────────────────

export type FieldError = "required" | "tooLong" | "invalidPrice" | "invalidRule";
export type OptionsFormState = {
  values?: Record<string, string>;
  errors?: Record<string, FieldError>;
  formError?: "forbidden" | "notFound";
  savedAt?: number;
};

async function context(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l); // restaurant + role from host + session, never from the form
  return { locale: l, actor: { restaurantId: staff.restaurantId, role: staff.role } };
}

const text = (form: FormData, key: string, max = 500) => {
  const v = form.get(key);
  return typeof v === "string" ? v.slice(0, max) : "";
};

function toFormState(values: Record<string, string>, error: MenuUseCaseError): OptionsFormState {
  const name = (lang: "en" | "ar") => (lang === "ar" ? "nameAr" : "nameEn");
  switch (error.type) {
    case "NAME_REQUIRED":
      return { values, errors: { [name(error.lang)]: "required" } };
    case "NAME_TOO_LONG":
      return { values, errors: { [name(error.lang)]: "tooLong" } };
    case "INVALID_SELECTION_RULE":
      return { values, errors: { rule: "invalidRule" } };
    case "INVALID_PRICE":
      return { values, errors: { price: "invalidPrice" } };
    case "FORBIDDEN":
      return { values, formError: "forbidden" };
    default:
      return { values, formError: "notFound" };
  }
}

const optionsPath = (locale: string) => `/${locale}/staff/menu/options`;

// ─── Groups ─────────────────────────────────────────────────────────────

export type GroupFormMode = { kind: "new"; sortOrder: number } | { kind: "edit"; groupId: string; sortOrder: number };

export async function saveGroupAction(
  locale: string,
  mode: GroupFormMode,
  _prev: OptionsFormState,
  form: FormData,
): Promise<OptionsFormState> {
  const ctx = await context(locale);
  const values = {
    nameAr: text(form, "nameAr"),
    nameEn: text(form, "nameEn"),
    minSelect: text(form, "minSelect", 3),
    maxSelect: text(form, "maxSelect", 3),
  };
  const int = (s: string) => (/^\d{1,3}$/.test(s.trim()) ? Number(s) : Number.NaN);
  const input = {
    name: { ar: values.nameAr, en: values.nameEn },
    minSelect: int(values.minSelect),
    maxSelect: int(values.maxSelect),
    sortOrder: mode.sortOrder,
  };

  const result =
    mode.kind === "new"
      ? await options.addGroup(ctx.actor, input)
      : await options.editGroup(ctx.actor, { ...input, groupId: mode.groupId as OptionGroupId });
  if (!result.ok) return toFormState(values, result.error);

  revalidatePath(`/${ctx.locale}/staff/menu`, "layout");
  // A new group has no options yet: go straight to its page to add them.
  redirect(mode.kind === "new" ? `${optionsPath(ctx.locale)}/${result.value.id}` : optionsPath(ctx.locale));
}

export async function deleteGroupAction(locale: string, groupId: string): Promise<void> {
  const ctx = await context(locale);
  await options.deleteGroup(ctx.actor, { groupId: groupId as OptionGroupId });
  revalidatePath(`/${ctx.locale}/staff/menu`, "layout");
  redirect(optionsPath(ctx.locale));
}

// ─── Options ────────────────────────────────────────────────────────────

export type OptionFormMode =
  | { kind: "new"; groupId: string; sortOrder: number }
  | { kind: "edit"; optionId: string; sortOrder: number };

export async function saveOptionAction(
  locale: string,
  mode: OptionFormMode,
  _prev: OptionsFormState,
  form: FormData,
): Promise<OptionsFormState> {
  const ctx = await context(locale);
  const values = { nameAr: text(form, "nameAr"), nameEn: text(form, "nameEn"), price: text(form, "price", 20) };
  // Empty extra price means "free" (0), the common case for choices like "No onion".
  const priceFils = values.price.trim() === "" ? 0 : parsePriceInput(values.price);
  if (priceFils === null) return { values, errors: { price: "invalidPrice" } };

  const input = { name: { ar: values.nameAr, en: values.nameEn }, priceDeltaFils: priceFils, sortOrder: mode.sortOrder };
  const result =
    mode.kind === "new"
      ? await options.addOption(ctx.actor, { ...input, groupId: mode.groupId as OptionGroupId })
      : await options.editOption(ctx.actor, { ...input, optionId: mode.optionId as OptionId });
  if (!result.ok) return toFormState(values, result.error);

  revalidatePath(`/${ctx.locale}/staff/menu`, "layout");
  // New-option form starts empty again; edit forms keep the saved values.
  return mode.kind === "new" ? { savedAt: Date.now() } : { values, savedAt: Date.now() };
}

export async function moveOptionAction(locale: string, optionId: string, dir: string): Promise<void> {
  const ctx = await context(locale);
  await options.moveOption(ctx.actor, { optionId: optionId as OptionId, direction: dir === "up" ? "up" : "down" });
  revalidatePath(`/${ctx.locale}/staff/menu`, "layout");
}

export async function deleteOptionAction(locale: string, optionId: string): Promise<void> {
  const ctx = await context(locale);
  await options.deleteOption(ctx.actor, { optionId: optionId as OptionId });
  revalidatePath(`/${ctx.locale}/staff/menu`, "layout");
}

// ─── Item <-> groups ────────────────────────────────────────────────────

export async function setItemGroupsAction(
  locale: string,
  itemId: string,
  _prev: OptionsFormState,
  form: FormData,
): Promise<OptionsFormState> {
  const ctx = await context(locale);
  const groupIds = form.getAll("groupIds").filter((v): v is string => typeof v === "string") as OptionGroupId[];
  const result = await options.setItemGroups(ctx.actor, { itemId: itemId as MenuItemId, groupIds });
  if (!result.ok) return toFormState({}, result.error);
  revalidatePath(`/${ctx.locale}/staff/menu`, "layout");
  return { savedAt: Date.now() };
}
