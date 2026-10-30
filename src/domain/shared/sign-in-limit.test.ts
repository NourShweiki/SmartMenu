import { describe, expect, it } from "vitest";
import {
  failureWindowStart,
  isSignInBlocked,
  MAX_FAILURES_PER_ACCOUNT,
  MAX_FAILURES_PER_VISITOR,
  SIGN_IN_WINDOW_MINUTES,
  signInKeys,
} from "./sign-in-limit";

describe("sign-in attempt limit", () => {
  it("is 5 wrong passwords per account and 20 per visitor in 15 minutes", () => {
    expect([MAX_FAILURES_PER_ACCOUNT, MAX_FAILURES_PER_VISITOR, SIGN_IN_WINDOW_MINUTES]).toEqual([5, 20, 15]);
  });

  it("blocks once an account has used up its failures, not before", () => {
    expect(isSignInBlocked({ account: 4, visitor: 0 })).toBe(false);
    expect(isSignInBlocked({ account: 5, visitor: 0 })).toBe(true);
  });

  it("blocks once a visitor has used up its failures, whatever the account", () => {
    expect(isSignInBlocked({ account: 0, visitor: 19 })).toBe(false);
    expect(isSignInBlocked({ account: 0, visitor: 20 })).toBe(true);
  });

  it("counts the email the way sign-in reads it: case and spaces do not make a new account", () => {
    expect(signInKeys("  Owner@Demo-Dinein.TEST ", null).account).toBe(signInKeys("owner@demo-dinein.test", null).account);
  });

  it("keeps account and visitor keys apart, and has no visitor key without an address", () => {
    expect(signInKeys("a@b.test", "abc")).toEqual({ account: "account:a@b.test", visitor: "visitor:abc" });
    expect(signInKeys("a@b.test", null).visitor).toBeNull();
  });

  it("counts failures of the last 15 minutes (newer than this moment)", () => {
    expect(failureWindowStart(new Date("2026-10-30T12:00:00Z"))).toEqual(new Date("2026-10-30T11:45:00Z"));
  });
});
