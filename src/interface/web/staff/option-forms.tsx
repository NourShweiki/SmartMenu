"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { MAX_NAME_LENGTH } from "@/domain/menu/menu";
import { MAX_SELECT_LIMIT } from "@/domain/menu/options";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";
import type { OptionsFormState } from "./option-actions";

type FormAction = (state: OptionsFormState, form: FormData) => Promise<OptionsFormState>;

const inputBase =
  "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";
const primary = "rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-60";

function useField(state: OptionsFormState, initial: Record<string, string>) {
  const t = useTranslations("Options");
  const values = state.values ?? initial;
  return {
    values,
    props: (name: string) => ({
      name,
      id: name,
      defaultValue: values[name],
      "aria-invalid": state.errors?.[name] ? true : undefined,
      className: `${inputBase} ${state.errors?.[name] ? "border-red-500" : "border-gray-300"}`,
    }),
    error: (name: string) =>
      state.errors?.[name] ? (
        <p className="text-sm text-red-700">{t(`errors.${state.errors[name]}`, { max: MAX_NAME_LENGTH, limit: MAX_SELECT_LIMIT })}</p>
      ) : null,
  };
}

function FormError({ state }: { state: OptionsFormState }) {
  const t = useTranslations("Options");
  return state.formError ? (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {t(`errors.${state.formError}`)}
    </p>
  ) : null;
}

/** Group name + how many options a customer must / may pick. */
export function OptionGroupForm({
  action,
  initial,
  cancelHref,
}: {
  action: FormAction;
  initial: Record<string, string>;
  cancelHref: string;
}) {
  const t = useTranslations("Options");
  const [state, formAction, pending] = useActionState(action, {});
  const f = useField(state, initial);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormError state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="nameAr" className="text-sm font-semibold">{t("nameAr")}</label>
          <input {...f.props("nameAr")} dir="rtl" lang="ar" />
          {f.error("nameAr")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="nameEn" className="text-sm font-semibold">{t("nameEn")}</label>
          <input {...f.props("nameEn")} dir="ltr" lang="en" />
          {f.error("nameEn")}
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">{t("rule")}</legend>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="minSelect" className="text-sm">{t("minSelect")}</label>
            <input {...f.props("minSelect")} type="number" min={0} max={MAX_SELECT_LIMIT} dir="ltr" className={`${f.props("minSelect").className} w-24`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="maxSelect" className="text-sm">{t("maxSelect")}</label>
            <input {...f.props("maxSelect")} type="number" min={1} max={MAX_SELECT_LIMIT} dir="ltr" className={`${f.props("maxSelect").className} w-24`} />
          </div>
        </div>
        <p className="text-xs text-gray-500">{t("ruleHint")}</p>
        {f.error("rule")}
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? t("saving") : t("save")}
        </button>
        <Link href={cancelHref} className="rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}

/** One option row: Arabic name, English name, extra price. Used for "add" and for each existing option. */
export function OptionRowForm({
  action,
  initial,
  submitLabel,
  remove,
}: {
  action: FormAction;
  initial: Record<string, string>;
  submitLabel: string;
  /** Present for existing options: a delete button with confirmation. */
  remove?: { action: () => Promise<void>; question: string; label: string };
}) {
  const t = useTranslations("Options");
  const [state, formAction, pending] = useActionState(action, {});
  const f = useField(state, initial);
  return (
    <div className="flex flex-col gap-2">
      <form key={state.savedAt ?? 0} action={formAction} className="grid items-start gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
        <div>
          <input {...f.props("nameAr")} dir="rtl" lang="ar" aria-label={t("nameAr")} placeholder={t("nameAr")} />
          {f.error("nameAr")}
        </div>
        <div>
          <input {...f.props("nameEn")} dir="ltr" lang="en" aria-label={t("nameEn")} placeholder={t("nameEn")} />
          {f.error("nameEn")}
        </div>
        <div>
          <input {...f.props("price")} dir="ltr" inputMode="decimal" aria-label={t("extraPrice")} placeholder="+0.000" />
          {f.error("price")}
        </div>
        <button type="submit" disabled={pending} className={primary}>
          {pending ? t("saving") : submitLabel}
        </button>
      </form>
      <FormError state={state} />
      {remove && (
        <form action={remove.action}>
          <ConfirmSubmit question={remove.question} className="text-sm text-red-700 hover:underline">
            {remove.label}
          </ConfirmSubmit>
        </form>
      )}
    </div>
  );
}

/** Checkboxes on the item edit page: which groups this item offers. */
export function ItemGroupsForm({
  action,
  groups,
  selected,
}: {
  action: FormAction;
  groups: { id: string; label: string; rule: string }[];
  selected: string[];
}) {
  const t = useTranslations("Options");
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError state={state} />
      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">{t("noGroupsYet")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id}>
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
                <input type="checkbox" name="groupIds" value={g.id} defaultChecked={selected.includes(g.id)} className="size-4" />
                <span className="font-semibold">{g.label}</span>
                <span className="text-sm text-gray-500">{g.rule}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || groups.length === 0} className={primary}>
          {pending ? t("saving") : t("saveItemGroups")}
        </button>
        {state.savedAt && !state.formError && <span className="text-sm text-green-700">{t("saved")}</span>}
      </div>
    </form>
  );
}
