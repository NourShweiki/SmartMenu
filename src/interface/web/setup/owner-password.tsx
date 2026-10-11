"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";

/** What the founder is shown ONCE after issuing a new temporary password. */
export type OwnerPasswordState = { issued?: { temporaryPassword: string }; error?: "notAnOwner" | "notAllowed" };

type IssueAction = (state: OwnerPasswordState, form: FormData) => Promise<OwnerPasswordState>;

/**
 * One owner on the founders' list: their email, and the button that gives them a new temporary password (after an
 * "are you sure?", because their current password stops working at once). The new password shows here, once.
 */
export function OwnerPassword({ action, email }: { action: IssueAction; email: string }) {
  const t = useTranslations("Setup");
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm">
          <span className="text-gray-500">{t("owner")}</span> <bdi dir="ltr">{email}</bdi>
        </p>
        <ConfirmSubmit
          question={t("newPasswordConfirm", { email })}
          disabled={pending}
          className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-60"
        >
          {pending ? t("newPasswordPending") : t("newPassword")}
        </ConfirmSubmit>
      </form>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.issued && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-green-50 p-3 ring-1 ring-green-200">
          <p className="text-sm font-semibold text-green-900">{t("newPasswordIssued", { email })}</p>
          <code dir="ltr" className="self-start select-all rounded-lg bg-white px-3 py-1.5 text-lg font-semibold tracking-wider ring-1 ring-green-300">
            {state.issued.temporaryPassword}
          </code>
          <p className="text-sm text-green-900">{t("newPasswordNote")}</p>
        </div>
      )}
    </div>
  );
}
