import { describe, expect, it } from "vitest";
import { readSettingsForm, settingsProblem, toRestaurantSettings, type SettingsFormValues } from "./settings-form-model";

const form = (entries: Record<string, string>) => new Map(Object.entries(entries)) as unknown as FormData;

describe("readSettingsForm", () => {
  it("reads ticked checkboxes (present) and unticked ones (absent)", () => {
    const values = readSettingsForm(
      form({ dineInEnabled: "on", takeoutEnabled: "on", taxPercent: "16", servicePercent: "10", defaultLanguage: "en" }),
    );
    expect(values).toEqual({
      dineInEnabled: true,
      takeoutEnabled: true,
      deliveryEnabled: false,
      taxPercent: "16",
      servicePercent: "10",
      defaultLanguage: "en",
    });
  });

  it("falls back to Arabic for an unknown language and caps the text length", () => {
    const values = readSettingsForm(form({ defaultLanguage: "fr", taxPercent: "1".repeat(100) }));
    expect(values.defaultLanguage).toBe("ar");
    expect(values.taxPercent).toHaveLength(20);
    expect(values.servicePercent).toBe("");
  });
});

describe("toRestaurantSettings", () => {
  const values: SettingsFormValues = {
    dineInEnabled: true,
    takeoutEnabled: false,
    deliveryEnabled: false,
    taxPercent: "16",
    servicePercent: "١٢٫٥",
    defaultLanguage: "ar",
  };

  it("turns percentages into basis points", () => {
    expect(toRestaurantSettings(values)).toEqual({
      ok: true,
      value: {
        dineInEnabled: true,
        takeoutEnabled: false,
        deliveryEnabled: false,
        taxRateBp: 1600,
        serviceChargeBp: 1250,
        defaultLanguage: "ar",
      },
    });
  });

  it("flags exactly the field that is not a percentage (tax and service are not swapped)", () => {
    expect(toRestaurantSettings({ ...values, taxPercent: "abc" })).toEqual({ ok: false, errors: { taxPercent: "invalid" } });
    expect(toRestaurantSettings({ ...values, servicePercent: "" })).toEqual({ ok: false, errors: { servicePercent: "invalid" } });
    expect(toRestaurantSettings({ ...values, taxPercent: "x", servicePercent: "y" })).toEqual({
      ok: false,
      errors: { taxPercent: "invalid", servicePercent: "invalid" },
    });
  });
});

describe("settingsProblem", () => {
  it("maps every use-case failure to what the form shows", () => {
    expect(settingsProblem({ type: "FORBIDDEN" })).toEqual({ formError: "forbidden" });
    expect(settingsProblem({ type: "NO_ORDER_MODE_ENABLED" })).toEqual({ formError: "noMode" });
    expect(settingsProblem({ type: "NOT_FOUND" })).toEqual({ formError: "notFound" });
    expect(settingsProblem({ type: "INVALID_RATE", field: "taxRateBp" })).toEqual({ errors: { taxPercent: "invalid" } });
    expect(settingsProblem({ type: "INVALID_RATE", field: "serviceChargeBp" })).toEqual({
      errors: { servicePercent: "invalid" },
    });
  });
});
