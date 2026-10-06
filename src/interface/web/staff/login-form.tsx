"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { SignInState } from "./actions";

type Action = (state: SignInState, form: FormData) => Promise<SignInState>;

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

export function LoginForm({ action }: { action: Action }) {
  const t = useTranslations("StaffLogin");
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("email")}
        {/* Emails are always left-to-right, even on the Arabic page. */}
        <input name="email" type="email" required autoComplete="username" dir="ltr" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("password")}
        <input name="password" type="password" required autoComplete="current-password" dir="ltr" className={inputClass} />
      </label>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("invalid")}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-gray-900 px-4 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
