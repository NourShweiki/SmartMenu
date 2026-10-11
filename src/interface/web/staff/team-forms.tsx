"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { ASSIGNABLE_ROLES, type AssignableRole } from "@/domain/restaurant/role";
import { ConfirmSubmit } from "@/interface/web/components/confirm-submit";
import type { AddMemberState, MemberActionState } from "./team-model";

type AddAction = (state: AddMemberState, form: FormData) => Promise<AddMemberState>;
type MemberAction = (state: MemberActionState, form: FormData) => Promise<MemberActionState>;

const inputClass = "w-full rounded-lg border bg-white px-3 py-2 text-base outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";
const smallButton = "rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-60";

/** A temporary password, shown once, big enough to read out and easy to select. */
function TemporaryPassword({ title, password, note }: { title: string; password: string; note: string }) {
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl bg-green-50 p-3 ring-1 ring-green-200">
      <p className="text-sm font-semibold text-green-900">
        <bdi>{title}</bdi>
      </p>
      <code dir="ltr" className="self-start select-all rounded-lg bg-white px-3 py-1.5 text-lg font-semibold tracking-wider ring-1 ring-green-300">
        {password}
      </code>
      <p className="text-sm text-green-900">{note}</p>
    </div>
  );
}

/** "Add a member": email and role. The answer shows the new member's temporary password once. */
export function AddMemberForm({ action }: { action: AddAction }) {
  const t = useTranslations("Team");
  const roles = useTranslations("Roles");
  const [state, formAction, pending] = useActionState(action, {});
  const emailError = state.errors?.email;

  return (
    <div className="flex flex-col gap-4">
      {state.added && (
        <TemporaryPassword
          title={t("addedTitle", { email: state.added.email, role: roles(state.added.role) })}
          password={state.added.temporaryPassword}
          note={t("passwordNote")}
        />
      )}
      <form key={state.round ?? 0} action={formAction} className="flex flex-col gap-4">
        {state.formError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {t(`errors.${state.formError}`)}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1">
            <label htmlFor="member-email" className="text-sm font-semibold">
              {t("email")}
            </label>
            {/* Emails are always left-to-right, even on the Arabic page. */}
            <input
              id="member-email"
              name="email"
              type="email"
              required
              maxLength={254}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={state.values?.email ?? ""}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "member-email-error" : "member-email-hint"}
              className={`${inputClass} ${emailError ? "border-red-500" : "border-gray-300"}`}
            />
            {emailError ? (
              <p id="member-email-error" className="text-sm text-red-700">
                {t(`errors.${emailError}`)}
              </p>
            ) : (
              <p id="member-email-hint" className="text-sm text-gray-500">
                {t("emailHint")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="member-role" className="text-sm font-semibold">
              {t("role")}
            </label>
            <select id="member-role" name="role" defaultValue={state.values?.role ?? "WAITER"} className={`${inputClass} border-gray-300`}>
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roles(role)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <button type="submit" disabled={pending} className="rounded-lg bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-gray-700 disabled:opacity-60">
            {pending ? t("adding") : t("add")}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * What can be done to one member (never shown for oneself or for an owner): another role, a new temporary password,
 * removal from the restaurant. Each is its own small form; the last two ask "are you sure?" first.
 */
export function MemberActions({
  email,
  role,
  changeRole,
  issuePassword,
  remove,
}: {
  email: string;
  role: AssignableRole;
  changeRole: MemberAction;
  issuePassword: MemberAction;
  remove: MemberAction;
}) {
  const t = useTranslations("Team");
  const roles = useTranslations("Roles");
  const [roleState, roleAction, rolePending] = useActionState(changeRole, {});
  const [passwordState, passwordAction, passwordPending] = useActionState(issuePassword, {});
  const [removeState, removeAction, removePending] = useActionState(remove, {});
  const error = roleState.error ?? passwordState.error ?? removeState.error;
  const selectId = `role-${email}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {/* Remount when the role changes on the server, so the select shows the stored role. */}
        <form key={`${role}-${roleState.round ?? 0}`} action={roleAction} className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={selectId} className="text-xs text-gray-500">
              {t("roleOf", { email })}
            </label>
            <select id={selectId} name="role" defaultValue={role} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm">
              {ASSIGNABLE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {roles(option)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={rolePending} className={smallButton}>
            {rolePending ? t("saving") : t("saveRole")}
          </button>
        </form>
        <form action={passwordAction}>
          <ConfirmSubmit question={t("newPasswordConfirm", { email })} disabled={passwordPending} className={smallButton}>
            {passwordPending ? t("working") : t("newPassword")}
          </ConfirmSubmit>
        </form>
        <form action={removeAction}>
          <ConfirmSubmit question={t("removeConfirm", { email })} disabled={removePending} className={`${smallButton} text-red-700`}>
            {removePending ? t("working") : t("remove")}
          </ConfirmSubmit>
        </form>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${error}`)}
        </p>
      )}
      {passwordState.issued && <TemporaryPassword title={t("newPasswordIssued", { email })} password={passwordState.issued.temporaryPassword} note={t("passwordNote")} />}
    </div>
  );
}
