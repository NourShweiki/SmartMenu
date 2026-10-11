import type { ChangeOwnPasswordError } from "@/application/use-cases/change-own-password";

// Pure form logic for the "change my password" screen, kept out of the "use server" file so it can be unit tested.
// The state never carries a password back to the browser: after any answer the three fields are empty again.

export type PasswordField = "current" | "next" | "repeat";
export type PasswordFieldError = "wrong" | "tooShort" | "tooLong" | "unchanged" | "refused" | "mismatch";

export type PasswordFormState = {
  errors?: Partial<Record<PasswordField, PasswordFieldError>>;
  formError?: "notSignedIn";
  /** True right after the password was changed. */
  saved?: boolean;
  /** Changes with every answer, so the form remounts with empty fields. */
  round?: number;
};

type FormLike = { get(name: string): FormDataEntryValue | null };

const MAX_INPUT = 200; // far above any password we accept; only stops absurd input early

/** The three fields, exactly as typed (a password is never trimmed). `null` when the two new entries differ. */
export function readPasswordForm(form: FormLike): { current: string; next: string } | null {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.slice(0, MAX_INPUT) : "";
  };
  const next = text("next");
  return next === text("repeat") ? { current: text("current"), next } : null;
}

export function passwordProblem(error: ChangeOwnPasswordError): Pick<PasswordFormState, "errors" | "formError"> {
  switch (error.type) {
    case "WRONG_PASSWORD":
      return { errors: { current: "wrong" } };
    case "PASSWORD_TOO_SHORT":
      return { errors: { next: "tooShort" } };
    case "PASSWORD_TOO_LONG":
      return { errors: { next: "tooLong" } };
    case "PASSWORD_UNCHANGED":
      return { errors: { next: "unchanged" } };
    case "PASSWORD_REFUSED":
      return { errors: { next: "refused" } };
    case "NOT_SIGNED_IN":
      return { formError: "notSignedIn" };
  }
}
