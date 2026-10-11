import { describe, expect, it } from "vitest";
import { isUuid } from "./uuid";

describe("isUuid", () => {
  it("accepts a UUID in either letter case", () => {
    expect(isUuid("11111111-1111-4000-8000-000000000001")).toBe(true);
    expect(isUuid("AAAA0001-0000-4000-8000-00000000000F")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "not-an-id", "11111111-1111-4000-8000-00000000000", "11111111-1111-4000-8000-000000000001 ", "11111111111140008000000000000001", "g1111111-1111-4000-8000-000000000001"]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
