import { describe, expect, it } from "vitest";
import { validateNewPassword } from "./password";

describe("validateNewPassword", () => {
  it("accepts ten characters or more, exactly as typed", () => {
    expect(validateNewPassword("correct horse", "old-password")).toEqual({ ok: true, value: "correct horse" });
    expect(validateNewPassword(" ten chars ", "old-password")).toEqual({ ok: true, value: " ten chars " }); // nothing trimmed
    expect(validateNewPassword("كلمة سر طويلة", "old-password").ok).toBe(true); // 13 Arabic characters
    expect(validateNewPassword("1234567890", "old-password").ok).toBe(true);
  });

  it("refuses a short or blank password", () => {
    for (const short of ["", "123456789", "كلمة سر", " ".repeat(12)]) {
      expect(validateNewPassword(short, "old-password")).toEqual({ ok: false, error: { type: "PASSWORD_TOO_SHORT" } });
    }
  });

  it("refuses more than 72 bytes (the part after that would be ignored when signing in)", () => {
    expect(validateNewPassword("a".repeat(72), "old-password").ok).toBe(true);
    expect(validateNewPassword("a".repeat(73), "old-password")).toEqual({ ok: false, error: { type: "PASSWORD_TOO_LONG" } });
    expect(validateNewPassword("ك".repeat(37), "old-password")).toEqual({ ok: false, error: { type: "PASSWORD_TOO_LONG" } }); // 74 bytes
  });

  it("refuses the password that is being replaced", () => {
    expect(validateNewPassword("same-password", "same-password")).toEqual({ ok: false, error: { type: "PASSWORD_UNCHANGED" } });
  });
});
