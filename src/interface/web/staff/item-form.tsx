"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from "@/domain/menu/menu";
import type { ItemField, ItemFormState, ItemFormValues } from "./item-actions";

type Action = (state: ItemFormState, form: FormData) => Promise<ItemFormState>;

const inputClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export function ItemForm({
  action,
  initial,
  categories,
  cancelHref,
}: {
  action: Action;
  initial: ItemFormValues;
  categories: { id: string; label: string }[];
  cancelHref: string;
}) {
  const t = useTranslations("ItemForm");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;

  // Field + its translated error, wired for screen readers.
  const field = (name: ItemField) => {
    const error = state.errors?.[name];
    return {
      name,
      id: name,
      defaultValue: values[name],
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${name}-error` : undefined,
      className: `${inputClass} ${error ? "border-red-500" : "border-gray-300"}`,
    };
  };
  const errorFor = (name: ItemField) => {
    const error = state.errors?.[name];
    if (!error) return null;
    return (
      <p id={`${name}-error`} className="text-sm text-red-700">
        {t(`errors.${error}`, { max: name.startsWith("name") ? MAX_NAME_LENGTH : MAX_DESCRIPTION_LENGTH })}
      </p>
    );
  };
  const label = (name: ItemField, text: string, optional = false) => (
    <label htmlFor={name} className="text-sm font-semibold">
      {text}
      {optional && <span className="ms-1 font-normal text-gray-500">({t("optional")})</span>}
    </label>
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.formError}`)}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {label("categoryId", t("category"))}
        <select {...field("categoryId")}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {errorFor("categoryId")}
      </div>

      {/* Bilingual fields side by side (arabic-rtl skill): Arabic is typed right-to-left. */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          {label("nameAr", t("nameAr"))}
          <input {...field("nameAr")} dir="rtl" lang="ar" maxLength={MAX_NAME_LENGTH + 20} />
          {errorFor("nameAr")}
        </div>
        <div className="flex flex-col gap-1">
          {label("nameEn", t("nameEn"))}
          <input {...field("nameEn")} dir="ltr" lang="en" maxLength={MAX_NAME_LENGTH + 20} />
          {errorFor("nameEn")}
        </div>
        <div className="flex flex-col gap-1">
          {label("descriptionAr", t("descriptionAr"), true)}
          <textarea {...field("descriptionAr")} dir="rtl" lang="ar" rows={3} />
          {errorFor("descriptionAr")}
        </div>
        <div className="flex flex-col gap-1">
          {label("descriptionEn", t("descriptionEn"), true)}
          <textarea {...field("descriptionEn")} dir="ltr" lang="en" rows={3} />
          {errorFor("descriptionEn")}
        </div>
      </div>

      <div className="flex max-w-xs flex-col gap-1">
        {label("price", t("price"))}
        <div className="flex items-center gap-2">
          <input {...field("price")} dir="ltr" inputMode="decimal" placeholder="4.500" />
          <span className="text-sm text-gray-500">{t("currency")}</span>
        </div>
        <p className="text-xs text-gray-500">{t("priceHint")}</p>
        {errorFor("price")}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
        >
          {pending ? t("saving") : t("save")}
        </button>
        <Link href={cancelHref} className="rounded-lg px-4 py-2.5 text-gray-700 hover:bg-gray-100">
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
