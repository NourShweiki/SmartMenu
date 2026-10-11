import { describe, expect, it } from "vitest";
import type { Fils } from "@/domain/shared/money";
import { formatPrice, formatDayTime, formatTime } from "./format";

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

describe("formatTime", () => {
  it("shows the restaurant's wall clock (Amman), 24-hour, with Western digits in both languages", () => {
    const evening = new Date("2026-10-11T16:45:00Z"); // 19:45 in Amman (UTC+3)
    expect(formatTime(evening, "en")).toBe("19:45");
    expect(formatTime(evening, "ar")).toBe("19:45");
    const afterMidnight = new Date("2026-10-11T21:05:00Z"); // 00:05 the next day in Amman
    expect(formatTime(afterMidnight, "en")).toBe("00:05");
    expect(formatTime(afterMidnight, "ar")).toBe("00:05");
  });
});

describe("formatDayTime", () => {
  it("adds the day in Amman to the same 24-hour time, with Western digits", () => {
    const lateEvening = new Date("2026-10-11T21:05:00Z"); // already 12 October, 00:05, in Amman
    for (const locale of ["en", "ar"] as const) {
      const text = formatDayTime(lateEvening, locale);
      expect(text).toContain("00:05");
      expect(text).toContain("12");
      expect(text).not.toMatch(/[\u0660-\u0669]/); // no Arabic-Indic digits
    }
  });
});
