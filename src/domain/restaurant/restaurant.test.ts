import { describe, expect, it } from "vitest";
import { createRestaurant, updateSettings, validateSlug } from "./restaurant";
import { can } from "./role";
import { presetSettings } from "./settings";

const deps = { newId: () => "00000000-0000-4000-8000-000000000001", now: () => new Date("2026-10-06T00:00:00Z") };
const name = { en: "Hashem", ar: "هاشم" };

describe("createRestaurant", () => {
  it("creates a restaurant with normalized slug and preset settings", () => {
    const r = createRestaurant({ slug: "  Hashem-Downtown ", name, businessType: "dine-in" }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slug).toBe("hashem-downtown");
    expect(r.value.settings.dineInEnabled).toBe(true);
    expect(r.value.settings.taxRateBp).toBe(1600);
    expect(r.value.settings.defaultLanguage).toBe("ar");
  });

  it("requires both English and Arabic names", () => {
    const r = createRestaurant({ slug: "abc", name: { en: "Abc", ar: " " }, businessType: "takeout" }, deps);
    expect(r).toEqual({ ok: false, error: { type: "NAME_REQUIRED", lang: "ar" } });
  });

  it("takeout preset disables dine-in and service charge", () => {
    const s = presetSettings("takeout");
    expect(s.dineInEnabled).toBe(false);
    expect(s.takeoutEnabled).toBe(true);
    expect(s.serviceChargeBp).toBe(0);
  });
});

describe("validateSlug", () => {
  it.each(["ab", "-abc", "abc-", "a_b_c", "ab--cd", "مطعم", "a".repeat(41)])("rejects bad format: %s", (slug) => {
    expect(validateSlug(slug)).toEqual({ ok: false, error: { type: "INVALID_SLUG", reason: "FORMAT" } });
  });
  it.each(["www", "api", "admin"])("rejects reserved: %s", (slug) => {
    expect(validateSlug(slug)).toEqual({ ok: false, error: { type: "INVALID_SLUG", reason: "RESERVED" } });
  });
  it("accepts a normal slug", () => {
    expect(validateSlug("reem-1").ok).toBe(true);
  });
});

describe("updateSettings", () => {
  const r = createRestaurant({ slug: "abc", name, businessType: "dine-in" }, deps);
  if (!r.ok) throw new Error("setup failed");

  it("rejects turning off every order mode", () => {
    const res = updateSettings(r.value, { ...r.value.settings, dineInEnabled: false, takeoutEnabled: false, deliveryEnabled: false });
    expect(res).toEqual({ ok: false, error: { type: "NO_ORDER_MODE_ENABLED" } });
  });
  it("rejects fractional or out-of-range rates", () => {
    expect(updateSettings(r.value, { ...r.value.settings, taxRateBp: 16.5 }).ok).toBe(false);
    expect(updateSettings(r.value, { ...r.value.settings, serviceChargeBp: 10_001 }).ok).toBe(false);
  });
});

describe("role permissions", () => {
  it("lets owner, manager and waiter mark items sold out, but only owner/manager edit the menu", () => {
    for (const role of ["OWNER", "MANAGER", "WAITER"] as const) expect(can(role, "menu:sold-out")).toBe(true);
    expect(can("CASHIER", "menu:sold-out")).toBe(false);
    expect(can("WAITER", "menu:manage")).toBe(false);
    expect(can("MANAGER", "menu:manage")).toBe(true);
  });

  it("cashier cannot see service requests (spec §4)", () => {
    expect(can("CASHIER", "service-requests:handle")).toBe(false);
    expect(can("CASHIER", "payments:close")).toBe(true);
  });
  it("waiter handles service requests but not payments", () => {
    expect(can("WAITER", "service-requests:handle")).toBe(true);
    expect(can("WAITER", "payments:close")).toBe(false);
  });
  it("only owner changes restaurant settings", () => {
    expect(can("OWNER", "restaurant:settings")).toBe(true);
    expect(can("MANAGER", "restaurant:settings")).toBe(false);
  });
});
