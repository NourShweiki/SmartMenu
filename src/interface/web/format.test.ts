import { describe, expect, it } from "vitest";
import type { Fils } from "@/domain/shared/money";
import { formatPrice } from "./format";

const f = (n: number) => n as Fils;

describe("formatPrice", () => {
  it("shows 3 decimals and the currency label", () => {
    expect(formatPrice(f(4500), "en")).toBe("4.500 JD");
    expect(formatPrice(f(1250), "en")).toBe("1.250 JD");
    expect(formatPrice(f(0), "en")).toBe("0.000 JD");
  });

  it("uses Western digits in Arabic too", () => {
    expect(formatPrice(f(4500), "ar")).toBe("4.500 د.أ");
    expect(formatPrice(f(1_234_567), "ar")).toBe("1,234.567 د.أ");
  });
});
