import { describe, expect, it } from "vitest";
import { filsToPriceInput, parsePriceInput } from "./price-input";

describe("parsePriceInput", () => {
  it("reads JD amounts into whole fils", () => {
    expect(parsePriceInput("4.500")).toBe(4500);
    expect(parsePriceInput("4.5")).toBe(4500);
    expect(parsePriceInput("4.05")).toBe(4050);
    expect(parsePriceInput("12")).toBe(12000);
    expect(parsePriceInput("0")).toBe(0);
    expect(parsePriceInput(" 1.250 ")).toBe(1250);
    expect(parsePriceInput("3.")).toBe(3000);
  });

  it("accepts Arabic-Indic digits and the Arabic decimal separator", () => {
    expect(parsePriceInput("٤٫٥")).toBe(4500);
    expect(parsePriceInput("١٢")).toBe(12000);
    expect(parsePriceInput("4,25")).toBe(4250);
  });

  it("does not use float math (0.1 + 0.2 style errors)", () => {
    expect(parsePriceInput("0.3")).toBe(300);
    expect(parsePriceInput("1.005")).toBe(1005);
  });

  it("rejects anything that is not a plain amount with up to 3 decimals", () => {
    for (const bad of ["", "abc", "-1", "4.5000", "1e3", "4.5 JD", ".5", "1.2.3"]) {
      expect(parsePriceInput(bad)).toBeNull();
    }
  });
});

describe("filsToPriceInput", () => {
  it("formats fils for the edit form", () => {
    expect(filsToPriceInput(4500)).toBe("4.500");
    expect(filsToPriceInput(1005)).toBe("1.005");
    expect(filsToPriceInput(0)).toBe("0.000");
  });
});
