import { describe, expect, it } from "vitest";
import { normalizeJordanMobile } from "./phone";

describe("normalizeJordanMobile", () => {
  it("accepts the ways people write a Jordanian mobile number", () => {
    for (const written of [
      "0791234567",
      "791234567",
      "+962791234567",
      "00962791234567",
      "962791234567",
      "+962 79 123 4567",
      "079-123-4567",
      "(079) 123.4567",
      "+962 (0) 79 123 4567",
      "٠٧٩١٢٣٤٥٦٧",
      "۰۷۹۱۲۳۴۵۶۷",
      "  0791234567  ",
    ]) {
      expect(normalizeJordanMobile(written)).toBe("+962791234567");
    }
    expect(normalizeJordanMobile("0771234567")).toBe("+962771234567");
    expect(normalizeJordanMobile("0781234567")).toBe("+962781234567");
  });

  it("refuses what is not a Jordanian mobile number", () => {
    for (const bad of [
      "",
      "079123456", // one digit short
      "07912345678", // one too many
      "0751234567", // not a mobile prefix
      "064123456", // an Amman landline
      "+966501234567", // another country
      "+1 202 555 0147",
      "phone",
      "0791234567 ext 2",
      "+962+791234567",
    ]) {
      expect(normalizeJordanMobile(bad)).toBeNull();
    }
  });
});
