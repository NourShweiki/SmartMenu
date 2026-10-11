import type { CreateRestaurantError, CreateRestaurantRequest } from "@/application/use-cases/platform/create-restaurant";
import type { BusinessType } from "@/domain/restaurant/settings";
import type { LocalizedText } from "@/domain/shared/result";

// Pure form logic for the founders' "new restaurant" form, kept out of the "use server" file so it can be unit
// tested (a "use server" module may only export async functions).

export type NewRestaurantValues = {
  nameEn: string;
  nameAr: string;
  slug: string;
  businessType: BusinessType;
  ownerEmail: string;
};

export const EMPTY_NEW_RESTAURANT: NewRestaurantValues = { nameEn: "", nameAr: "", slug: "", businessType: "dine-in", ownerEmail: "" };

export type NewRestaurantField = "nameEn" | "nameAr" | "slug" | "ownerEmail";
export type NewRestaurantFieldError = "required" | "slugFormat" | "slugReserved" | "slugTaken" | "emailInvalid" | "emailTaken";

/** What the founder is shown ONCE after a restaurant was created. The password cannot be shown again. */
export type CreatedNotice = {
  name: LocalizedText;
  staffUrl: string;
  ownerEmail: string;
  temporaryPassword: string;
};

export type NewRestaurantState = {
  /** What the founder typed, kept after a refusal. Absent after a success: the form starts empty again. */
  values?: NewRestaurantValues;
  errors?: Partial<Record<NewRestaurantField, NewRestaurantFieldError>>;
  formError?: "alreadyCreated" | "notAllowed" | "failed";
  created?: CreatedNotice;
  /**
   * The id the form's NEXT submission carries: the same one after a refusal (so correcting a field and sending
   * again is still the same attempt), a fresh one after a success (that form is used up).
   */
  formId?: string;
};

type FormLike = { get(name: string): FormDataEntryValue | null };

export function readNewRestaurantForm(form: FormLike): { id: string; values: NewRestaurantValues } {
  const text = (name: string, max: number) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  };
  return {
    id: text("id", 36),
    values: {
      nameEn: text("nameEn", 80),
      nameAr: text("nameAr", 80),
      slug: text("slug", 40),
      businessType: text("businessType", 10) === "takeout" ? "takeout" : "dine-in",
      ownerEmail: text("ownerEmail", 254),
    },
  };
}

export function toCreateRequest(id: string, values: NewRestaurantValues): CreateRestaurantRequest {
  return {
    id,
    slug: values.slug,
    name: { en: values.nameEn, ar: values.nameAr },
    businessType: values.businessType,
    ownerEmail: values.ownerEmail,
  };
}

/** Where on the form a refusal belongs: next to the field that caused it, or on top when it is about the whole form. */
export function newRestaurantProblem(error: CreateRestaurantError): Pick<NewRestaurantState, "errors" | "formError"> {
  switch (error.type) {
    case "NAME_REQUIRED":
      return { errors: { [error.lang === "en" ? "nameEn" : "nameAr"]: "required" } };
    case "INVALID_SLUG":
      return { errors: { slug: error.reason === "RESERVED" ? "slugReserved" : "slugFormat" } };
    case "SLUG_TAKEN":
      return { errors: { slug: "slugTaken" } };
    case "INVALID_EMAIL":
      return { errors: { ownerEmail: "emailInvalid" } };
    case "EMAIL_TAKEN":
      return { errors: { ownerEmail: "emailTaken" } };
    case "ALREADY_CREATED":
      return { formError: "alreadyCreated" };
    case "NOT_SIGNED_IN":
    case "NOT_A_FOUNDER":
      return { formError: "notAllowed" };
    default:
      // A broken form id, or a preset the settings rules refuse: nothing the founder can correct on the form.
      return { formError: "failed" };
  }
}
