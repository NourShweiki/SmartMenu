"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/domain/shared/password";
import type { PasswordField, PasswordFormState } from "./password-model";

type ChangeAction = (state: PasswordFormState, form: FormData) => Promise<PasswordFormState>;

const inputClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export function PasswordForm({ action }: { action: ChangeAction }) {
  const t = useTranslations("Password");
  const [state, formAction, pending] = useActionState(action, {});

  const field = (name: PasswordField, autoComplete: string, hint?: string) => {
    const error = state.errors?.[name];
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={name} className="text-sm font-semibold">
          {t(name)}
        </label>
        {/* Passwords are always left-to-right, even on the Arabic page. */}
        <input
          id={name}
          name={name}
          type="password"
          required
          dir="ltr"
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
          className={`${inputClass} ${error ? "border-red-500" : "border-gray-300"}`}
        />
        {error ? (
          <p id={`${name}-error`} className="text-sm text-red-700">
            {t(`errors.${error}`, { min: PASSWORD_MIN_LENGTH })}
          </p>
        ) : (
          hint && (
            <p id={`${name}-hint`} className="text-sm text-gray-500">
              {hint}
            </p>
          )
        )}
      </div>
    );
  };

  return (
    // Remount after every answer: the fields come back empty (a password is never sent back to the browser).
    <form key={state.round ?? 0} action={formAction} className="flex flex-col gap-5">
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

      {field("current", "current-password")}
      {field("next", "new-password", t("nextHint", { min: PASSWORD_MIN_LENGTH }))}
      {field("repeat", "new-password")}

      <div>
        <button type="submit" disabled={pending} className="rounded-lg bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-60">
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
    </form>
  );
}
