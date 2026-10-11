"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import type { BusinessType } from "@/domain/restaurant/settings";
import { localized } from "@/domain/shared/localized";
import type { Locale } from "@/interface/web/i18n/locales";
import { EMPTY_NEW_RESTAURANT, type NewRestaurantField, type NewRestaurantState } from "./new-restaurant-model";

type CreateAction = (state: NewRestaurantState, form: FormData) => Promise<NewRestaurantState>;

const inputClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

/**
 * The founders' "new restaurant" form. `initialId` is the id of the form's first submission (see NewRestaurantState
 * .formId for the ones after). `presets` are the tax and service percentages each business type starts with, so the
 * form says what choosing it means.
 */
export function NewRestaurantForm({
  action,
  initialId,
  rootDomain,
  presets,
}: {
  action: CreateAction;
  initialId: string;
  rootDomain: string;
  presets: Record<BusinessType, { tax: string; service: string }>;
}) {
  const t = useTranslations("Setup");
  const locale = useLocale() as Locale;
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? EMPTY_NEW_RESTAURANT;
  const formId = state.formId ?? initialId;
  const created = state.created;

  const field = (name: NewRestaurantField, options: { dir?: "ltr" | "rtl"; type?: string; hint?: string; suffix?: string; maxLength: number; autoComplete?: string }) => {
    const error = state.errors?.[name];
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={name} className="text-sm font-semibold">
          {t(name)}
        </label>
        <div className="flex items-center gap-2" dir={options.suffix ? "ltr" : undefined}>
          <input
            id={name}
            name={name}
            type={options.type ?? "text"}
            defaultValue={values[name]}
            required
            maxLength={options.maxLength}
            dir={options.dir}
            autoComplete={options.autoComplete ?? "off"}
            autoCapitalize={options.dir === "ltr" ? "none" : undefined}
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${name}-error` : options.hint ? `${name}-hint` : undefined}
            className={`${inputClass} ${error ? "border-red-500" : "border-gray-300"}`}
          />
          {options.suffix && <span className="shrink-0 text-gray-500">{options.suffix}</span>}
        </div>
        {error ? (
          <p id={`${name}-error`} className="text-sm text-red-700">
            {t(`errors.${error}`)}
          </p>
        ) : (
          options.hint && (
            <p id={`${name}-hint`} className="text-sm text-gray-500">
              {options.hint}
            </p>
          )
        )}
      </div>
    );
  };

  const type = (value: BusinessType, label: string) => (
    <label className="flex items-start gap-3">
      <input type="radio" name="businessType" value={value} defaultChecked={values.businessType === value} className="mt-1 size-4" />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-gray-500">
          {t(value === "dine-in" ? "dineInHint" : "takeoutHint", presets[value])}
        </span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      {created && (
        <section role="status" aria-labelledby="created-title" className="flex flex-col gap-3 rounded-xl bg-green-50 p-4 ring-1 ring-green-200">
          <h3 id="created-title" className="text-lg font-semibold text-green-900">
            {t("createdTitle", { name: localized(created.name, locale) })}
          </h3>
          <dl className="flex flex-col gap-3">
            <div>
              <dt className="text-sm font-semibold text-green-900">{t("createdAddress")}</dt>
              <dd>
                <a href={created.staffUrl} target="_blank" rel="noreferrer" className="break-all underline">
                  <bdi dir="ltr">{created.staffUrl}</bdi>
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-green-900">{t("createdEmail")}</dt>
              <dd>
                <bdi dir="ltr" className="select-all break-all">
                  {created.ownerEmail}
                </bdi>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-green-900">{t("createdPassword")}</dt>
              <dd>
                <code dir="ltr" className="inline-block select-all rounded-lg bg-white px-3 py-1.5 text-lg font-semibold tracking-wider ring-1 ring-green-300">
                  {created.temporaryPassword}
                </code>
              </dd>
            </div>
          </dl>
          <p className="text-sm font-semibold text-green-900">{t("createdNote")}</p>
        </section>
      )}

      {/* Remount after every answer, so the inputs show exactly what the server kept (or start empty after a success). */}
      <form key={formId + JSON.stringify(values)} action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="id" value={formId} />
        {state.formError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {t(`errors.${state.formError}`)}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {field("nameEn", { dir: "ltr", maxLength: 80 })}
          {field("nameAr", { dir: "rtl", maxLength: 80 })}
        </div>
        {field("slug", { dir: "ltr", maxLength: 40, suffix: `.${rootDomain}`, hint: t("slugHint") })}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">{t("businessType")}</legend>
          {type("dine-in", t("dineIn"))}
          {type("takeout", t("takeout"))}
          <p className="text-sm text-gray-500">{t("typeNote")}</p>
        </fieldset>

        {field("ownerEmail", { dir: "ltr", type: "email", maxLength: 254, hint: t("ownerEmailHint") })}

        <div>
          <button type="submit" disabled={pending} className="rounded-lg bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-60">
            {pending ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
