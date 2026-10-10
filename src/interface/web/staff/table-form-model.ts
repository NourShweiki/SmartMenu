import type { TableUseCaseError } from "@/application/use-cases/tables/shared";

// Pure form logic for the tables screen, kept out of the "use server" file so it can be unit tested
// (a "use server" module may only export async functions).

export type TableFormProblem = "required" | "tooLong" | "invalid" | "taken" | "forbidden" | "notFound";

export type TableFormState = {
  /** What the owner typed, kept so a mistake can be corrected without retyping. */
  label?: string;
  error?: TableFormProblem;
  /** Bumps after every successful change so the form can reset itself. */
  savedAt?: number;
};

/** Use-case failure -> what the form shows (translated by the form). */
export function tableProblem(error: TableUseCaseError): TableFormProblem {
  switch (error.type) {
    case "LABEL_REQUIRED":
      return "required";
    case "LABEL_TOO_LONG":
      return "tooLong";
    case "LABEL_INVALID":
      return "invalid";
    case "LABEL_TAKEN":
      return "taken";
    case "FORBIDDEN":
      return "forbidden";
    default:
      return "notFound"; // NOT_FOUND, DELETED, INVALID_TOKEN (cannot come from the form)
  }
}

/** The label field as typed (cut off at a sane length so a huge paste cannot reach the server logic). */
export function readLabel(form: { get(name: string): FormDataEntryValue | null }): string {
  const value = form.get("label");
  return typeof value === "string" ? value.slice(0, 100) : "";
}
