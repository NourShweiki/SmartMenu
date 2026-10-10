"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { SettingsFormState, SettingsFormValues } from "./settings-form-model";

type SaveAction = (state: SettingsFormState, form: FormData) => Promise<SettingsFormState>;

const inputClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export function SettingsForm({ action, initial }: { action: SaveAction; initial: SettingsFormValues }) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;
  // Remount the inputs after every response so they show exactly what the server kept.
  const formKey = JSON.stringify(values) + String(state.saved);

  const mode = (name: "dineInEnabled" | "takeoutEnabled" | "deliveryEnabled", label: string, hint: string) => (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={values[name]} className="mt-1 size-4" />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-gray-500">{hint}</span>
      </span>
    </label>
  );

  const percent = (name: "taxPercent" | "servicePercent") => {
    const error = state.errors?.[name];
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={name} className="text-sm font-semibold">
          {t(name)}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={name}
            name={name}
            defaultValue={values[name]}
            inputMode="decimal"
            dir="ltr"
            maxLength={7}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${name}-error` : `${name}-hint`}
            className={`${inputClass} max-w-32 ${error ? "border-red-500" : "border-gray-300"}`}
          />
          <span aria-hidden>%</span>
        </div>
        {error ? (
          <p id={`${name}-error`} className="text-sm text-red-700">
            {t("errors.invalidRate")}
          </p>
        ) : (
          <p id={`${name}-hint`} className="text-sm text-gray-500">
            {t(`${name}Hint`)}
          </p>
        )}
      </div>
    );
  };

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
        <legend className="mb-1 text-lg font-semibold">{t("modesTitle")}</legend>
        {mode("dineInEnabled", t("dineIn"), t("dineInHint"))}
        {mode("takeoutEnabled", t("takeout"), t("takeoutHint"))}
        {mode("deliveryEnabled", t("delivery"), t("deliveryHint"))}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">{t("chargesTitle")}</legend>
        {percent("taxPercent")}
        {percent("servicePercent")}
        <p className="text-sm text-gray-500">{t("chargesNote")}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-lg font-semibold">{t("languageTitle")}</legend>
        <label htmlFor="defaultLanguage" className="text-sm font-semibold">
          {t("defaultLanguage")}
        </label>
        <select
          id="defaultLanguage"
          name="defaultLanguage"
          defaultValue={values.defaultLanguage}
          className={`${inputClass} max-w-48 border-gray-300`}
        >
          <option value="ar">{t("languageAr")}</option>
          <option value="en">{t("languageEn")}</option>
        </select>
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
