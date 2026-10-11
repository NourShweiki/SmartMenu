import { describe, expect, it } from "vitest";
import { newTemporaryPassword } from "./random-token";

describe("newTemporaryPassword", () => {
  it("is three groups of four unambiguous characters, different every time", () => {
    const made = Array.from({ length: 200 }, newTemporaryPassword);
    for (const password of made) expect(password).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
    expect(new Set(made).size).toBe(200);
  });
});
