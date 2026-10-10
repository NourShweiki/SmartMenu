import { describe, expect, it } from "vitest";
import { bpToRateInput, parseRateInput } from "./rate-input";

describe("parseRateInput", () => {
  it("turns percentages into basis points", () => {
    expect(parseRateInput("16")).toBe(1600);
    expect(parseRateInput("0")).toBe(0);
    expect(parseRateInput("10.5")).toBe(1050);
    expect(parseRateInput("12.05")).toBe(1205);
    expect(parseRateInput("100")).toBe(10_000);
    expect(parseRateInput(" 16 % ")).toBe(1600);
    expect(parseRateInput("7.")).toBe(700);
  });

  it("accepts Arabic digits, the Arabic decimal mark and a decimal comma", () => {
    expect(parseRateInput("١٦")).toBe(1600);
    expect(parseRateInput("١٠٫٥")).toBe(1050);
    expect(parseRateInput("10,5")).toBe(1050);
  });

  it("is exact where floats are not (no 0.29 * 100 = 28.999...)", () => {
    expect(parseRateInput("0.29")).toBe(29);
    expect(parseRateInput("1.15")).toBe(115);
  });

  it("rejects anything that is not a plain percentage", () => {
    for (const bad of ["", "abc", "-5", "1e2", "16.123", "1.2.3", "1 000", "1000", ".5", "16%%"]) {
      expect(parseRateInput(bad)).toBeNull();
    }
  });
});

describe("bpToRateInput", () => {
  it("round-trips with parseRateInput", () => {
    for (const bp of [0, 1, 5, 29, 100, 1050, 1205, 1600, 9999, 10_000]) {
      expect(parseRateInput(bpToRateInput(bp))).toBe(bp);
    }
  });

  it("drops needless zeros", () => {
    expect(bpToRateInput(1600)).toBe("16");
    expect(bpToRateInput(1050)).toBe("10.5");
    expect(bpToRateInput(1205)).toBe("12.05");
    expect(bpToRateInput(5)).toBe("0.05");
  });
});
