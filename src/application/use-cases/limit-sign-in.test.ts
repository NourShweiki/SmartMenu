import { describe, expect, it } from "vitest";
import type { SignInAttemptLog } from "@/application/ports/sign-in-attempt-log";
import { err, ok, type Result } from "@/domain/shared/result";
import { MAX_FAILURES_PER_ACCOUNT, MAX_FAILURES_PER_VISITOR, SIGN_IN_WINDOW_MINUTES } from "@/domain/shared/sign-in-limit";
import { makeLimitedSignIn } from "./limit-sign-in";

/** In-memory log: every failure with its time, per key. */
function fakeLog() {
  const failures: { key: string; at: Date }[] = [];
  const log: SignInAttemptLog = {
    async countFailures(keys, since) {
      const counts: Record<string, number> = {};
      for (const f of failures) if (keys.includes(f.key) && f.at > since) counts[f.key] = (counts[f.key] ?? 0) + 1;
      return counts;
    },
    async recordFailure(keys, at) {
      for (const key of keys) failures.push({ key, at });
    },
    async clearFailures(key) {
      const kept = failures.filter((f) => f.key !== key);
      failures.splice(0, failures.length, ...kept);
    },
  };
  return { log, failures };
}

/** A sign-in where only "right-password" works, counting how often the password was really tried. */
function setup(start = new Date("2026-10-30T12:00:00Z")) {
  const { log, failures } = fakeLog();
  const clock = { at: start, now: () => clock.at };
  const tried = { count: 0 };
  const signIn = async (input: { email: string; password: string }): Promise<Result<{ userId: string }, { type: "INVALID_CREDENTIALS" }>> => {
    tried.count++;
    return input.password === "right-password" ? ok({ userId: "u1" }) : err({ type: "INVALID_CREDENTIALS" });
  };
  const limited = makeLimitedSignIn({ attempts: log, clock }, signIn);
  const attempt = (password: string, email = "owner@grill.test", visitorHash: string | null = "visitor-1") =>
    limited({ email, password, visitorHash });
  const later = (minutes: number) => (clock.at = new Date(clock.at.getTime() + minutes * 60_000));
  return { attempt, tried, failures, later };
}

describe("sign-in attempt limit (use case)", () => {
  it("lets the right password through and passes the wrapped sign-in only its own input", async () => {
    const { attempt } = setup();
    expect(await attempt("right-password")).toEqual(ok({ userId: "u1" }));
  });

  it("after 5 wrong passwords for one account, refuses even the right one without trying it", async () => {
    const { attempt, tried } = setup();
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) expect(await attempt("wrong")).toEqual(err({ type: "INVALID_CREDENTIALS" }));
    expect(await attempt("right-password")).toEqual(err({ type: "TOO_MANY_ATTEMPTS" }));
    expect(tried.count).toBe(MAX_FAILURES_PER_ACCOUNT); // the blocked attempt never reached the sign-in service
  });

  it("counts the account across visitors and email spellings", async () => {
    const { attempt } = setup();
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) await attempt("wrong", i % 2 ? "OWNER@grill.test" : "owner@grill.test", `visitor-${i}`);
    expect(await attempt("right-password", "owner@grill.test", "visitor-new")).toEqual(err({ type: "TOO_MANY_ATTEMPTS" }));
  });

  it("lets the account in again once the window has passed", async () => {
    const { attempt, later } = setup();
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) await attempt("wrong");
    later(SIGN_IN_WINDOW_MINUTES - 1);
    expect(await attempt("right-password")).toEqual(err({ type: "TOO_MANY_ATTEMPTS" }));
    later(1);
    expect(await attempt("right-password")).toEqual(ok({ userId: "u1" }));
  });

  it("a success forgets the account's earlier failures", async () => {
    const { attempt } = setup();
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT - 1; i++) await attempt("wrong");
    expect((await attempt("right-password")).ok).toBe(true);
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT - 1; i++) await attempt("wrong");
    expect((await attempt("right-password")).ok).toBe(true);
  });

  it("stops one visitor trying many accounts, but not other visitors", async () => {
    const { attempt } = setup();
    for (let i = 0; i < MAX_FAILURES_PER_VISITOR; i++) await attempt("wrong", `staff${i}@grill.test`, "visitor-1");
    expect(await attempt("right-password", "owner@grill.test", "visitor-1")).toEqual(err({ type: "TOO_MANY_ATTEMPTS" }));
    expect(await attempt("right-password", "owner@grill.test", "visitor-2")).toEqual(ok({ userId: "u1" }));
  });

  it("a success does not reset the visitor's count", async () => {
    const { attempt } = setup();
    for (let i = 0; i < MAX_FAILURES_PER_VISITOR - 1; i++) await attempt("wrong", `staff${i}@grill.test`, "visitor-1");
    expect((await attempt("right-password", "owner@grill.test", "visitor-1")).ok).toBe(true);
    await attempt("wrong", "another@grill.test", "visitor-1");
    expect(await attempt("right-password", "owner@grill.test", "visitor-1")).toEqual(err({ type: "TOO_MANY_ATTEMPTS" }));
  });

  it("without a known address only the account is counted", async () => {
    const { attempt, failures } = setup();
    await attempt("wrong", "owner@grill.test", null);
    expect(failures.map((f) => f.key)).toEqual(["account:owner@grill.test"]);
  });
});
