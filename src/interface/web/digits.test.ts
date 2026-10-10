import { describe, expect, it } from "vitest";
import { normalizeDecimal, normalizeDigits } from "./digits";

describe("normalizeDigits", () => {
  it("turns Arabic-Indic and Persian digits into 0-9 and leaves everything else alone", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeDigits("+٩٦٢ ٦ ٥٥٥ ٠١٠٠ (abc) 7,5")).toBe("+962 6 555 0100 (abc) 7,5");
  });
});

describe("normalizeDecimal", () => {
  it("also turns the Arabic decimal mark and a decimal comma into a dot", () => {
    expect(normalizeDecimal("٤٫٥")).toBe("4.5");
    expect(normalizeDecimal("10,5")).toBe("10.5");
  });
});
