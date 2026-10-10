import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDING, type Branding } from "@/domain/restaurant/branding";
import { publicDetails } from "./public-restaurant-view";

const full: Branding = {
  ...DEFAULT_BRANDING,
  tagline: { en: "Charcoal grills", ar: "مشاوي على الفحم" },
  about: { en: "Family-run.", ar: "مطعم عائلي." },
  address: { en: "Rainbow St.", ar: "شارع الرينبو" },
  phone: "(06) 555 0100",
  openingHours: { en: "Daily 12-23", ar: "يوميًا ١٢-٢٣" },
};

describe("publicDetails", () => {
  it("shows each detail in the visitor's language", () => {
    expect(publicDetails(full, "en")).toMatchObject({ tagline: "Charcoal grills", address: "Rainbow St.", hours: "Daily 12-23" });
    expect(publicDetails(full, "ar")).toMatchObject({ tagline: "مشاوي على الفحم", address: "شارع الرينبو", hours: "يوميًا ١٢-٢٣" });
  });

  it("falls back to the other language when one is empty", () => {
    const onlyEnglish = { ...full, about: { en: "Family-run.", ar: "" } };
    expect(publicDetails(onlyEnglish, "ar").about).toBe("Family-run.");
  });

  it("builds a phone link with only digits and +", () => {
    expect(publicDetails(full, "en").phoneHref).toBe("tel:065550100");
    expect(publicDetails({ ...full, phone: "+962 6 555-0100" }, "en").phoneHref).toBe("tel:+96265550100");
    expect(publicDetails({ ...full, phone: "" }, "en").phoneHref).toBeNull();
    expect(publicDetails({ ...full, phone: "   " }, "en")).toMatchObject({ phone: "", phoneHref: null });
  });

  it("has no details section for a restaurant with nothing written", () => {
    const empty = publicDetails(DEFAULT_BRANDING, "en");
    expect(empty).toMatchObject({ tagline: "", hasDetails: false, phoneHref: null });
    // A tagline alone is shown in the header, so it does not count as a "details" section.
    expect(publicDetails({ ...DEFAULT_BRANDING, tagline: { en: "Hi", ar: "" } }, "en").hasDetails).toBe(false);
    expect(publicDetails({ ...DEFAULT_BRANDING, phone: "+962795551234" }, "en").hasDetails).toBe(true);
  });
});
