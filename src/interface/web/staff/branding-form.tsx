"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { ACCENT_COLORS, BRANDING_LIMITS } from "@/domain/restaurant/branding";
import { MAX_NAME_LENGTH } from "@/domain/menu/menu";
import type { BrandingField, BrandingFormState, BrandingFormValues } from "./branding-form-model";

type SaveAction = (state: BrandingFormState, form: FormData) => Promise<BrandingFormState>;

const inputClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export function BrandingForm({ action, initial }: { action: SaveAction; initial: BrandingFormValues }) {
  const t = useTranslations("Branding");
  const tCommon = useTranslations("Common");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;
  // Remount the inputs after every response so they show exactly what the server kept.
  const formKey = JSON.stringify(values) + String(state.saved);

  /** One text field. `lang` sets the writing direction of the input (Arabic is right-to-left). */
  const field = (
    name: BrandingField,
    lang: "ar" | "en" | null,
    opts: { multiline?: boolean; max?: number; dir?: "ltr"; inputMode?: "tel" } = {},
  ) => {
    const error = state.errors?.[name];
    const common = {
      id: name,
      name,
      defaultValue: values[name],
      dir: opts.dir ?? (lang === "ar" ? "rtl" : lang === "en" ? "ltr" : undefined),
      lang: lang ?? undefined,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${name}-error` : undefined,
      className: `${inputClass} ${error ? "border-red-500" : "border-gray-300"}`,
    } as const;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={name} className="text-sm font-semibold">
          {t(`fields.${name}`)}
        </label>
        {opts.multiline ? (
          <textarea {...common} rows={3} />
        ) : (
          <input {...common} type="text" inputMode={opts.inputMode} />
        )}
        {error && (
          <p id={`${name}-error`} className="text-sm text-red-700">
            {t(`errors.${error}`, { max: opts.max ?? MAX_NAME_LENGTH })}
          </p>
        )}
      </div>
    );
  };

  const pair = (en: BrandingField, ar: BrandingField, opts: { multiline?: boolean; max: number }) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {field(ar, "ar", opts)}
      {field(en, "en", opts)}
    </div>
  );

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-8">
      {state.formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.formError}`)}
        </p>
      )}
      {state.saved && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {t("saved")}
        </p>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("nameTitle")}</legend>
        {pair("nameEn", "nameAr", { max: MAX_NAME_LENGTH })}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t("colorTitle")}</legend>
        <p className="text-sm text-gray-500">{t("colorHint")}</p>
        <div role="radiogroup" aria-label={t("colorTitle")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACCENT_COLORS.map((color) => (
            <label
              key={color.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 has-[:checked]:border-gray-900 has-[:checked]:ring-2 has-[:checked]:ring-gray-900 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gray-900"
            >
              <input type="radio" name="accent" value={color.id} defaultChecked={values.accent === color.id} className="sr-only" />
              <span aria-hidden className="size-6 shrink-0 rounded-full" style={{ backgroundColor: color.hex }} />
              <span className="text-sm">{t(`colors.${color.id}`)}</span>
            </label>
          ))}
        </div>
        {state.errors?.accent && <p className="text-sm text-red-700">{t("errors.invalid")}</p>}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">{t("detailsTitle")}</legend>
        {pair("taglineEn", "taglineAr", { max: BRANDING_LIMITS.tagline })}
        {pair("aboutEn", "aboutAr", { multiline: true, max: BRANDING_LIMITS.about })}
        {pair("addressEn", "addressAr", { max: BRANDING_LIMITS.address })}
        {field("phone", null, { dir: "ltr", inputMode: "tel" })}
        {pair("hoursEn", "hoursAr", { multiline: true, max: BRANDING_LIMITS.openingHours })}
      </fieldset>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
        >
          {pending ? tCommon("saving") : tCommon("save")}
        </button>
      </div>
    </form>
  );
}
