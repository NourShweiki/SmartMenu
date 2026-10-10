import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDING } from "@/domain/restaurant/branding";
import { toPublicRestaurant, type PublicRestaurantRow } from "./supabase-restaurant-repository";

const row: PublicRestaurantRow = {
  id: "11111111-1111-4000-8000-000000000001",
  slug: "demo-dinein",
  name_en: "Demo Grill",
  name_ar: "مشاوي التجربة",
  dine_in_enabled: true,
  takeout_enabled: true,
  delivery_enabled: false,
  tax_rate_bp: 1600,
  service_charge_bp: 1000,
  default_language: "ar",
  branding: {},
};

describe("toPublicRestaurant", () => {
  it("maps snake_case DB columns to the domain shape", () => {
    expect(toPublicRestaurant(row)).toEqual({
      id: row.id,
      slug: "demo-dinein",
      name: { en: "Demo Grill", ar: "مشاوي التجربة" },
      settings: {
        dineInEnabled: true,
        takeoutEnabled: true,
        deliveryEnabled: false,
        taxRateBp: 1600,
        serviceChargeBp: 1000,
        defaultLanguage: "ar",
      },
      branding: DEFAULT_BRANDING,
    });
  });

  it("reads the stored branding, and falls back to the defaults when it is odd", () => {
    const stored = { accent: "teal", logoPath: "r/logo-1.png", tagline: { en: "Hi", ar: "مرحبا" }, phone: "+962 6 555 0100" };
    expect(toPublicRestaurant({ ...row, branding: stored }).branding).toMatchObject(stored);
    for (const odd of [null, "x", [], { accent: "chartreuse" }]) {
      expect(toPublicRestaurant({ ...row, branding: odd }).branding).toEqual(DEFAULT_BRANDING);
    }
  });

  it("keeps English as the default language when set", () => {
    expect(toPublicRestaurant({ ...row, default_language: "en" }).settings.defaultLanguage).toBe("en");
  });
});
