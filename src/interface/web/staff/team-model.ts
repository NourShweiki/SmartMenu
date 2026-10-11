import type { StaffError } from "@/application/use-cases/staff/staff-use-cases";
import type { AssignableRole } from "@/domain/restaurant/role";

// Pure form logic for the staff ("team") screen, kept out of the "use server" file so it can be unit tested.

export type AddMemberValues = { email: string; role: string };

/** What whoever added a member is shown ONCE. The password cannot be shown again (a new one can be issued). */
export type AddedNotice = { email: string; role: AssignableRole; temporaryPassword: string };

export type AddMemberState = {
  /** What was typed, kept after a refusal. Absent after a success: the form starts empty again. */
  values?: AddMemberValues;
  errors?: { email?: "invalid" | "taken" | "alreadyMember" };
  formError?: "forbidden" | "invalidRole";
  added?: AddedNotice;
  /** Changes with every answer, so the form remounts and shows what the server kept. */
  round?: number;
};

/** The answer to an action on one member (role, new password, remove). */
export type MemberActionState = {
  issued?: { temporaryPassword: string };
  error?: "forbidden" | "notFound" | "self" | "owner" | "notResettable" | "invalidRole";
  round?: number;
};

type FormLike = { get(name: string): FormDataEntryValue | null };

const text = (form: FormLike, name: string, max: number) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};

export const readAddMemberForm = (form: FormLike): AddMemberValues => ({ email: text(form, "email", 254), role: text(form, "role", 10) });
export const readRole = (form: FormLike): string => text(form, "role", 10);

/** Where on the "add a member" form a refusal belongs. */
export function addMemberProblem(error: StaffError): Pick<AddMemberState, "errors" | "formError"> {
  switch (error.type) {
    case "INVALID_EMAIL":
      return { errors: { email: "invalid" } };
    case "EMAIL_TAKEN":
      return { errors: { email: "taken" } };
    case "ALREADY_MEMBER":
      return { errors: { email: "alreadyMember" } };
    case "INVALID_ROLE":
      return { formError: "invalidRole" };
    default:
      return { formError: "forbidden" };
  }
}

/** The message for a refused action on one member. */
export function memberProblem(error: StaffError): NonNullable<MemberActionState["error"]> {
  switch (error.type) {
    case "NOT_FOUND":
      return "notFound";
    case "CANNOT_CHANGE_SELF":
      return "self";
    case "OWNER_PROTECTED":
      return "owner";
    case "NOT_RESETTABLE":
      return "notResettable";
    case "INVALID_ROLE":
      return "invalidRole";
    default:
      return "forbidden";
  }
}
