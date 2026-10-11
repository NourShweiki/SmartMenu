import { describe, expect, it } from "vitest";
import { addMemberProblem, memberProblem, readAddMemberForm, readRole } from "./team-model";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("reading the team forms", () => {
  it("reads the email and the role, tidied", () => {
    expect(readAddMemberForm(form({ email: "  New.Waiter@Grill.test ", role: "WAITER" }))).toEqual({ email: "New.Waiter@Grill.test", role: "WAITER" });
    expect(readRole(form({ role: " CASHIER " }))).toBe("CASHIER");
  });

  it("survives missing and over-long input (the use case judges the values)", () => {
    expect(readAddMemberForm(form({}))).toEqual({ email: "", role: "" });
    expect(readAddMemberForm(form({ email: "x".repeat(400), role: "SOMETHING-VERY-LONG" }))).toEqual({ email: "x".repeat(254), role: "SOMETHING-" });
  });
});

describe("where refusals show", () => {
  it("on the add form: next to the email, or on top", () => {
    expect(addMemberProblem({ type: "INVALID_EMAIL" })).toEqual({ errors: { email: "invalid" } });
    expect(addMemberProblem({ type: "EMAIL_TAKEN" })).toEqual({ errors: { email: "taken" } });
    expect(addMemberProblem({ type: "ALREADY_MEMBER" })).toEqual({ errors: { email: "alreadyMember" } });
    expect(addMemberProblem({ type: "INVALID_ROLE" })).toEqual({ formError: "invalidRole" });
    expect(addMemberProblem({ type: "FORBIDDEN" })).toEqual({ formError: "forbidden" });
  });

  it("on a member's row", () => {
    expect(memberProblem({ type: "NOT_FOUND" })).toBe("notFound");
    expect(memberProblem({ type: "CANNOT_CHANGE_SELF" })).toBe("self");
    expect(memberProblem({ type: "OWNER_PROTECTED" })).toBe("owner");
    expect(memberProblem({ type: "NOT_RESETTABLE" })).toBe("notResettable");
    expect(memberProblem({ type: "INVALID_ROLE" })).toBe("invalidRole");
    expect(memberProblem({ type: "FORBIDDEN" })).toBe("forbidden");
    expect(memberProblem({ type: "EMAIL_TAKEN" })).toBe("forbidden");
  });
});
