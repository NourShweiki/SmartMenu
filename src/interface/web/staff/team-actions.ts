"use server";

import { revalidatePath } from "next/cache";
import { team } from "@/infrastructure/container";
import { DEFAULT_LOCALE, isLocale } from "@/interface/web/i18n/locales";
import { requireStaff } from "./require-staff";
import { addMemberProblem, memberProblem, readAddMemberForm, readRole, type AddMemberState, type MemberActionState } from "./team-model";

/** Who is acting: the restaurant from the host, the person and their role from the session. Never from the form. */
async function actorFor(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const { staff } = await requireStaff(l);
  return { l, actor: { restaurantId: staff.restaurantId, role: staff.role, userId: staff.userId } };
}

const next = (prev: { round?: number }) => (prev.round ?? 0) + 1;

/** "Add a member": an account with a temporary password, shown once in the answer. */
export async function addMemberAction(locale: string, prev: AddMemberState, form: FormData): Promise<AddMemberState> {
  const { l, actor } = await actorFor(locale);
  const values = readAddMemberForm(form);

  const result = await team.add(actor, values);
  if (!result.ok) return { values, ...addMemberProblem(result.error), round: next(prev) };

  revalidatePath(`/${l}/staff/team`);
  return { added: result.value, round: next(prev) };
}

/** The member's id is bound by the page, but it is only a request: the use case checks who it is and what they are. */
export async function changeMemberRoleAction(locale: string, userId: string, prev: MemberActionState, form: FormData): Promise<MemberActionState> {
  const { l, actor } = await actorFor(locale);
  const result = await team.changeRole(actor, { userId, role: readRole(form) });
  revalidatePath(`/${l}/staff/team`); // also after a refusal: the list then shows how things really are
  return result.ok ? { round: next(prev) } : { error: memberProblem(result.error), round: next(prev) };
}

export async function removeMemberAction(locale: string, userId: string, prev: MemberActionState): Promise<MemberActionState> {
  const { l, actor } = await actorFor(locale);
  const result = await team.remove(actor, { userId });
  revalidatePath(`/${l}/staff/team`);
  return result.ok ? { round: next(prev) } : { error: memberProblem(result.error), round: next(prev) };
}

export async function issueMemberPasswordAction(locale: string, userId: string, prev: MemberActionState): Promise<MemberActionState> {
  const { actor } = await actorFor(locale);
  const result = await team.issuePassword(actor, { userId });
  return result.ok ? { issued: { temporaryPassword: result.value.temporaryPassword }, round: next(prev) } : { error: memberProblem(result.error), round: next(prev) };
}
