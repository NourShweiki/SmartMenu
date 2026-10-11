import { describe, expect, it } from "vitest";
import { passwordProblem, readPasswordForm } from "./password-model";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("readPasswordForm", () => {
  it("reads the passwords exactly as typed", () => {
    expect(readPasswordForm(form({ current: " old one ", next: "  my new password ", repeat: "  my new password " }))).toEqual({
      current: " old one ",
      next: "  my new password ",
    });
  });

  it("answers null when the new password was not repeated exactly", () => {
    expect(readPasswordForm(form({ current: "old", next: "my new password", repeat: "my new passwrod" }))).toBeNull();
    expect(readPasswordForm(form({ current: "old", next: "my new password", repeat: "my new password " }))).toBeNull();
    expect(readPasswordForm(form({ current: "old", next: "my new password" }))).toBeNull();
  });

  it("survives a form with nothing in it", () => {
    expect(readPasswordForm(form({}))).toEqual({ current: "", next: "" });
  });
});

describe("passwordProblem", () => {
  it("puts each refusal next to the field it is about", () => {
    expect(passwordProblem({ type: "WRONG_PASSWORD" })).toEqual({ errors: { current: "wrong" } });
    expect(passwordProblem({ type: "PASSWORD_TOO_SHORT" })).toEqual({ errors: { next: "tooShort" } });
    expect(passwordProblem({ type: "PASSWORD_TOO_LONG" })).toEqual({ errors: { next: "tooLong" } });
    expect(passwordProblem({ type: "PASSWORD_UNCHANGED" })).toEqual({ errors: { next: "unchanged" } });
    expect(passwordProblem({ type: "PASSWORD_REFUSED" })).toEqual({ errors: { next: "refused" } });
    expect(passwordProblem({ type: "NOT_SIGNED_IN" })).toEqual({ formError: "notSignedIn" });
  });
});
