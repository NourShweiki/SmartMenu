import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDING, updateBranding } from "@/domain/restaurant/branding";
import {
  BRANDING_FIELDS,
  brandingProblem,
  readBrandingForm,
  toBrandingInput,
  valuesFromRecord,
  type BrandingFormValues,
} from "./branding-form-model";

const form = (entries: Record<string, string>) => new Map(Object.entries(entries)) as unknown as FormData;

const values: BrandingFormValues = {
  nameEn: "Demo Grill",
  nameAr: "مشاوي التجربة",
  accent: "teal",
  taglineEn: "Charcoal grills",
  taglineAr: "",
  aboutEn: "",
  aboutAr: "",
  addressEn: "Amman",
  addressAr: "عمّان",
  phone: "+٩٦٢ ٦ ٥٥٥ ٠١٠٠",
  hoursEn: "Daily 12-23",
  hoursAr: "",
};

describe("readBrandingForm", () => {
  it("reads every field, and an absent field is an empty string", () => {
    expect(readBrandingForm(form({ nameEn: "A", accent: "red" }))).toEqual({
      ...Object.fromEntries(BRANDING_FIELDS.map((f) => [f, ""])),
      nameEn: "A",
      accent: "red",
    });
  });

  it("cuts a huge paste but leaves a little room for the domain to say 'too long'", () => {
    const read = readBrandingForm(form({ taglineEn: "x".repeat(10_000), aboutAr: "ع".repeat(10_000), phone: "1".repeat(500) }));
    expect(read.taglineEn).toHaveLength(130); // 80 + 50
    expect(read.aboutAr).toHaveLength(550); // 500 + 50
    expect(read.phone).toHaveLength(40);
  });
});

describe("toBrandingInput", () => {
  it("maps the language pairs and turns Arabic digits in the phone into 0-9", () => {
    const input = toBrandingInput(values);
    expect(input).toMatchObject({
      name: { en: "Demo Grill", ar: "مشاوي التجربة" },
      accent: "teal",
      tagline: { en: "Charcoal grills", ar: "" },
      address: { en: "Amman", ar: "عمّان" },
      phone: "+962 6 555 0100",
      openingHours: { en: "Daily 12-23", ar: "" },
    });
    expect(updateBranding(DEFAULT_BRANDING, input).ok).toBe(true); // and the domain accepts it
  });
});

describe("valuesFromRecord", () => {
  it("round-trips through the form", () => {
    const record = (() => {
      const r = updateBranding(DEFAULT_BRANDING, toBrandingInput(values));
      if (!r.ok) throw new Error("invalid");
      return r.value;
    })();
    expect(valuesFromRecord(record)).toEqual({ ...values, phone: "+962 6 555 0100" });
  });
});

describe("brandingProblem", () => {
  it("puts each domain error on the right field", () => {
    expect(brandingProblem({ type: "NAME_REQUIRED", lang: "en" })).toEqual({ errors: { nameEn: "required" } });
    expect(brandingProblem({ type: "NAME_REQUIRED", lang: "ar" })).toEqual({ errors: { nameAr: "required" } });
    expect(brandingProblem({ type: "NAME_TOO_LONG", lang: "ar" })).toEqual({ errors: { nameAr: "tooLong" } });
    expect(brandingProblem({ type: "INVALID_ACCENT" })).toEqual({ errors: { accent: "invalid" } });
    expect(brandingProblem({ type: "INVALID_PHONE" })).toEqual({ errors: { phone: "invalid" } });
    expect(brandingProblem({ type: "TEXT_TOO_LONG", field: "tagline", lang: "en", max: 80 })).toEqual({ errors: { taglineEn: "tooLong" } });
    expect(brandingProblem({ type: "TEXT_TOO_LONG", field: "about", lang: "ar", max: 500 })).toEqual({ errors: { aboutAr: "tooLong" } });
    expect(brandingProblem({ type: "TEXT_TOO_LONG", field: "address", lang: "en", max: 200 })).toEqual({ errors: { addressEn: "tooLong" } });
    expect(brandingProblem({ type: "TEXT_TOO_LONG", field: "openingHours", lang: "ar", max: 300 })).toEqual({ errors: { hoursAr: "tooLong" } });
  });

  it("maps permission and missing-row failures to a form-level message", () => {
    expect(brandingProblem({ type: "FORBIDDEN" })).toEqual({ formError: "forbidden" });
    expect(brandingProblem({ type: "NOT_FOUND" })).toEqual({ formError: "notFound" });
    expect(brandingProblem({ type: "PHOTO_TOO_LARGE" })).toEqual({ formError: "notFound" });
  });
});
