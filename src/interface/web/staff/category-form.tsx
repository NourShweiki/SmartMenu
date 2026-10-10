"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { MAX_NAME_LENGTH } from "@/domain/menu/menu";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";
import type { CategoryField, CategoryFormState, CategoryFormValues } from "./category-actions";

type SaveAction = (state: CategoryFormState, form: FormData) => Promise<CategoryFormState>;
type DeleteAction = (state: CategoryFormState) => Promise<CategoryFormState>;

const inputClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export function CategoryForm({
  action,
  initial,
  cancelHref,
}: {
  action: SaveAction;
  initial: CategoryFormValues;
  cancelHref: string;
}) {
  const t = useTranslations("CategoryForm");
  const tItem = useTranslations("ItemForm"); // the shared field-error texts (name required / too long)
  const tCommon = useTranslations("Common");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;

  const input = (name: CategoryField, lang: "ar" | "en") => {
    const error = state.errors?.[name];
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={name} className="text-sm font-semibold">
          {t(name)}
        </label>
        <input
          id={name}
          name={name}
          defaultValue={values[name]}
          dir={lang === "ar" ? "rtl" : "ltr"}
          lang={lang}
          maxLength={MAX_NAME_LENGTH + 20}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          className={`${inputClass} ${error ? "border-red-500" : "border-gray-300"}`}
        />
        {error && (
          <p id={`${name}-error`} className="text-sm text-red-700">
            {tItem(`errors.${error}`, { max: MAX_NAME_LENGTH })}
          </p>
        )}
      </div>
    );
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.formError}`)}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {input("nameAr", "ar")}
        {input("nameEn", "en")}
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
        >
          {pending ? tCommon("saving") : tCommon("save")}
        </button>
        <Link href={cancelHref} className="rounded-lg px-4 py-2.5 text-gray-700 hover:bg-gray-100">
          {tCommon("cancel")}
        </Link>
      </div>
    </form>
  );
}

/** Danger zone on the edit page. Disabled (with the reason) while the category has items. */
export function DeleteCategory({ action, itemCount }: { action: DeleteAction; itemCount: number }) {
  const t = useTranslations("CategoryForm");
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <h2 className="font-semibold text-red-700">{t("deleteTitle")}</h2>
      <p className="text-sm text-gray-600">{itemCount > 0 ? t("deleteBlocked", { count: itemCount }) : t("deleteHint")}</p>
      {state.formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.formError}`)}
        </p>
      )}
      <div>
        <ConfirmSubmit
          question={t("deleteConfirm")}
          disabled={pending || itemCount > 0}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("delete")}
        </ConfirmSubmit>
      </div>
    </form>
  );
}
