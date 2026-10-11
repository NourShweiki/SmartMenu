import { describe, expect, it } from "vitest";
import type { CurrentUser, UserId } from "@/application/ports/auth-gateway";
import { err, ok } from "@/domain/shared/result";
import { makeChangeOwnPassword } from "./change-own-password";

const USER = "user-1" as UserId;

function world(options: { user?: CurrentUser | null; refuse?: boolean } = {}) {
  const user = options.user === undefined ? { userId: USER, email: "waiter@grill.test", mustChangePassword: false } : options.user;
  const state = { password: "old-password-1", cleared: [] as string[], refreshed: 0, verified: [] as string[] };
  const change = makeChangeOwnPassword({
    auth: { currentUser: async () => user },
    passwords: {
      async verify(email, password) {
        state.verified.push(email);
        return password === state.password;
      },
      async set(next) {
        if (options.refuse) return err({ type: "PASSWORD_REFUSED" });
        state.password = next;
        return ok(undefined);
      },
      async refreshSession() {
        state.refreshed++;
      },
    },
    accounts: {
      async clearTemporaryPassword(userId) {
        state.cleared.push(userId);
      },
    },
  });
  return { change, state };
}

describe("changeOwnPassword", () => {
  it("replaces the password when the current one is right, and renews the session", async () => {
    const { change, state } = world();
    expect(await change({ current: "old-password-1", next: "my own new password" })).toEqual({ ok: true, value: undefined });
    expect(state.password).toBe("my own new password");
    expect(state.verified).toEqual(["waiter@grill.test"]);
    expect(state.refreshed).toBe(1);
    expect(state.cleared).toEqual([]); // it was not a temporary password
  });

  it("a temporary password stops being one once it is replaced", async () => {
    const { change, state } = world({ user: { userId: USER, email: "owner@new.test", mustChangePassword: true } });
    expect((await change({ current: "old-password-1", next: "my own new password" })).ok).toBe(true);
    expect(state.cleared).toEqual([USER]);
    expect(state.refreshed).toBe(1);
  });

  it("changes nothing without the right current password", async () => {
    const { change, state } = world({ user: { userId: USER, email: "owner@new.test", mustChangePassword: true } });
    expect(await change({ current: "a guess", next: "my own new password" })).toEqual({ ok: false, error: { type: "WRONG_PASSWORD" } });
    expect(state.password).toBe("old-password-1");
    expect(state.cleared).toEqual([]);
    expect(state.refreshed).toBe(0);
  });

  it("refuses a new password that breaks the rules before asking anybody", async () => {
    const { change, state } = world();
    expect(await change({ current: "old-password-1", next: "short" })).toEqual({ ok: false, error: { type: "PASSWORD_TOO_SHORT" } });
    expect(await change({ current: "old-password-1", next: "a".repeat(73) })).toEqual({ ok: false, error: { type: "PASSWORD_TOO_LONG" } });
    expect(await change({ current: "old-password-1", next: "old-password-1" })).toEqual({ ok: false, error: { type: "PASSWORD_UNCHANGED" } });
    expect(state.verified).toEqual([]);
    expect(state.password).toBe("old-password-1");
  });

  it("passes on the sign-in service's own refusal and keeps the temporary mark", async () => {
    const { change, state } = world({ user: { userId: USER, email: "owner@new.test", mustChangePassword: true }, refuse: true });
    expect(await change({ current: "old-password-1", next: "my own new password" })).toEqual({ ok: false, error: { type: "PASSWORD_REFUSED" } });
    expect(state.cleared).toEqual([]);
    expect(state.refreshed).toBe(0);
  });

  it("needs somebody to be signed in", async () => {
    const { change, state } = world({ user: null });
    expect(await change({ current: "old-password-1", next: "my own new password" })).toEqual({ ok: false, error: { type: "NOT_SIGNED_IN" } });
    expect(state.verified).toEqual([]);
  });
});
