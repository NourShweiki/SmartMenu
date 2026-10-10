import type { BrandingRecord } from "@/application/ports/branding-repository";
import type { BrandingUseCaseError } from "@/application/use-cases/branding/shared";
import { BRANDING_LIMITS, type BrandingInput } from "@/domain/restaurant/branding";
import { normalizeDigits } from "@/interface/web/digits";

// Pure form logic for the branding screen, kept out of the "use server" file so it can be unit tested
// (a "use server" module may only export async functions).

export const BRANDING_FIELDS = [
  "nameEn",
  "nameAr",
  "accent",
  "taglineEn",
  "taglineAr",
  "aboutEn",
  "aboutAr",
  "addressEn",
  "addressAr",
  "phone",
  "hoursEn",
  "hoursAr",
] as const;
export type BrandingField = (typeof BRANDING_FIELDS)[number];
export type BrandingFormValues = Record<BrandingField, string>;

export type BrandingFormState = {
  values?: BrandingFormValues;
  errors?: Partial<Record<BrandingField, "required" | "tooLong" | "invalid">>;
  formError?: "forbidden" | "notFound";
  /** True right after a successful save, so the form can say so. */
  saved?: boolean;
};

type FormLike = { get(name: string): FormDataEntryValue | null };

/**
 * What the owner submitted. Each value is capped a little above its domain limit, so a normal "too long"
 * is reported by the domain (with the right message) while a huge paste is still cut off.
 */
export function readBrandingForm(form: FormLike): BrandingFormValues {
  const text = (name: BrandingField, cap: number) => {
    const value = form.get(name);
    return typeof value === "string" ? value.slice(0, cap) : "";
  };
  const extra = 50;
  return {
    nameEn: text("nameEn", 200),
    nameAr: text("nameAr", 200),
    accent: text("accent", 20),
    taglineEn: text("taglineEn", BRANDING_LIMITS.tagline + extra),
    taglineAr: text("taglineAr", BRANDING_LIMITS.tagline + extra),
    aboutEn: text("aboutEn", BRANDING_LIMITS.about + extra),
    aboutAr: text("aboutAr", BRANDING_LIMITS.about + extra),
    addressEn: text("addressEn", BRANDING_LIMITS.address + extra),
    addressAr: text("addressAr", BRANDING_LIMITS.address + extra),
    phone: text("phone", 40),
    hoursEn: text("hoursEn", BRANDING_LIMITS.openingHours + extra),
    hoursAr: text("hoursAr", BRANDING_LIMITS.openingHours + extra),
  };
}

/** Form strings -> domain input. The phone may be typed with Arabic digits ("+٩٦٢ ٦ ٥٥٥ ٠١٠٠"). */
export function toBrandingInput(values: BrandingFormValues): BrandingInput {
  return {
    name: { en: values.nameEn, ar: values.nameAr },
    accent: values.accent,
    tagline: { en: values.taglineEn, ar: values.taglineAr },
    about: { en: values.aboutEn, ar: values.aboutAr },
    address: { en: values.addressEn, ar: values.addressAr },
    phone: normalizeDigits(values.phone),
    openingHours: { en: values.hoursEn, ar: values.hoursAr },
  };
}

/** Pre-fills the form from what is saved. */
export function valuesFromRecord(record: BrandingRecord): BrandingFormValues {
  const { name, branding: b } = record;
  return {
    nameEn: name.en,
    nameAr: name.ar,
    accent: b.accent,
    taglineEn: b.tagline.en,
    taglineAr: b.tagline.ar,
    aboutEn: b.about.en,
    aboutAr: b.about.ar,
    addressEn: b.address.en,
    addressAr: b.address.ar,
    phone: b.phone,
    hoursEn: b.openingHours.en,
    hoursAr: b.openingHours.ar,
  };
}

const lang = (l: "en" | "ar") => (l === "en" ? "En" : "Ar");
const TEXT_FIELD = { tagline: "tagline", about: "about", address: "address", openingHours: "hours" } as const;

/** Use-case failure -> what the form shows (translated by the form). */
export function brandingProblem(error: BrandingUseCaseError): Pick<BrandingFormState, "errors" | "formError"> {
  switch (error.type) {
    case "NAME_REQUIRED":
      return { errors: { [`name${lang(error.lang)}`]: "required" } };
    case "NAME_TOO_LONG":
      return { errors: { [`name${lang(error.lang)}`]: "tooLong" } };
    case "INVALID_ACCENT":
      return { errors: { accent: "invalid" } };
    case "TEXT_TOO_LONG":
      return { errors: { [`${TEXT_FIELD[error.field]}${lang(error.lang)}`]: "tooLong" } };
    case "INVALID_PHONE":
      return { errors: { phone: "invalid" } };
    case "FORBIDDEN":
      return { formError: "forbidden" };
    default:
      return { formError: "notFound" };
  }
}
