import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("trims and lower-cases a plausible address", () => {
    expect(normalizeEmail("  Waiter@Grill.Test ")).toBe("waiter@grill.test");
    expect(normalizeEmail("a.b+c@sub.example.jo")).toBe("a.b+c@sub.example.jo");
  });

  it("refuses what cannot be an address", () => {
    for (const bad of ["", "   ", "waiter", "waiter@grill", "@grill.test", "two words@grill.test", "a@b@c.test", `${"a".repeat(250)}@x.jo`]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});
