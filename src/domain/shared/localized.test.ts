import { describe, expect, it } from "vitest";
import { localized } from "./localized";

describe("localized", () => {
  const name = { en: "Demo Grill", ar: "مشاوي التجربة" };

  it("returns the requested language", () => {
    expect(localized(name, "ar")).toBe("مشاوي التجربة");
    expect(localized(name, "en")).toBe("Demo Grill");
  });

  it("falls back to the other language when the requested one is empty", () => {
    expect(localized({ en: "Coffee", ar: "  " }, "ar")).toBe("Coffee");
    expect(localized({ en: "", ar: "قهوة" }, "en")).toBe("قهوة");
  });
});
