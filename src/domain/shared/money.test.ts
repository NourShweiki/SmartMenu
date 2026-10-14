import { describe, expect, it } from "vitest";
import { MAX_PRICE_FILS, toFils } from "./money";

// PROJECT_SPEC.md §5: money is stored as whole numbers in FILS (1 JD = 1000 fils; JOD has 3 decimals), never floats
// and never a 2-decimal "cents" pattern.
describe("toFils", () => {
  it("accepts whole fils, zero included (a free extra)", () => {
    for (const amount of [0, 1, 250, 4500, 1000]) {
      const result = toFils(amount);
      expect(result.ok && result.value).toBe(amount);
    }
  });

  it("refuses fractions: 4.5 is not a number of fils (the JD -> fils step happens at the form, x1000)", () => {
    for (const amount of [4.5, 0.001, 1250.5]) expect(toFils(amount)).toEqual({ ok: false, error: { type: "INVALID_AMOUNT" } });
  });

  it("refuses negative amounts and things that are not numbers", () => {
    for (const amount of [-1, -1000, Number.NaN, Number.POSITIVE_INFINITY]) expect(toFils(amount).ok).toBe(false);
  });

  it("caps one price at 1,000,000 JD", () => {
    expect(MAX_PRICE_FILS).toBe(1_000_000 * 1000);
    expect(toFils(MAX_PRICE_FILS).ok).toBe(true);
    expect(toFils(MAX_PRICE_FILS + 1).ok).toBe(false);
  });
});
