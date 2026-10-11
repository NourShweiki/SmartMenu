"use server";

import { revalidatePath } from "next/cache";
import { changeOwnPassword } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { passwordProblem, readPasswordForm, type PasswordFormState } from "./password-model";
import { requireStaff } from "./require-staff";

/** "Change my password". Whose password is decided by the session, never by the form. */
export async function changePasswordAction(locale: string, prev: PasswordFormState, form: FormData): Promise<PasswordFormState> {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  await requireStaff(l, { allowTemporaryPassword: true });
  const round = (prev.round ?? 0) + 1;

  const passwords = readPasswordForm(form);
  if (!passwords) return { errors: { repeat: "mismatch" }, round };

  const result = await changeOwnPassword(passwords);
  if (!result.ok) return { ...passwordProblem(result.error), round };

  // Every staff page looked at "must change the password": let them be rendered afresh.
  revalidatePath(`/${l}/staff`, "layout");
  return { saved: true, round };
}
