import { describe, expect, it } from "vitest";
import { toSettings, toSettingsRow, type SettingsRow } from "./supabase-settings-repository";

const row: SettingsRow = {
  dine_in_enabled: true,
  takeout_enabled: false,
  delivery_enabled: true,
  tax_rate_bp: 1600,
  service_charge_bp: 1050,
  default_language: "en",
};

describe("settings mapping", () => {
  it("maps DB columns to the domain shape and back", () => {
    const settings = toSettings(row);
    expect(settings).toEqual({
      dineInEnabled: true,
      takeoutEnabled: false,
      deliveryEnabled: true,
      taxRateBp: 1600,
      serviceChargeBp: 1050,
      defaultLanguage: "en",
    });
    expect(toSettingsRow(settings)).toEqual(row);
  });

  it("falls back to Arabic for an unexpected language value", () => {
    expect(toSettings({ ...row, default_language: "fr" }).defaultLanguage).toBe("ar");
  });
});
