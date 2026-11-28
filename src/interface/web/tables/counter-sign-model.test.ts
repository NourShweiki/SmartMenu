import { describe, expect, it } from "vitest";
import { counterMenuUrl, offersCounterSign } from "./counter-sign-model";

describe("counterMenuUrl", () => {
  it("points at the menu in the restaurant's default language, on the address in use (also a preview link)", () => {
    expect(counterMenuUrl("https://coffee.ourapp.com", "ar")).toBe("https://coffee.ourapp.com/ar/menu");
    expect(counterMenuUrl("https://smart-menu.vercel.app/r/demo-takeout", "en")).toBe("https://smart-menu.vercel.app/r/demo-takeout/en/menu");
  });
});

describe("offersCounterSign", () => {
  it("only where takeout orders are taken, and only to whoever may print codes", () => {
    expect(offersCounterSign({ takeoutEnabled: true }, true)).toBe(true);
    expect(offersCounterSign({ takeoutEnabled: false }, true)).toBe(false);
    expect(offersCounterSign({ takeoutEnabled: true }, false)).toBe(false);
  });
});
