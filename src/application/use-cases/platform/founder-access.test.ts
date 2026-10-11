import { describe, expect, it } from "vitest";
import type { AuthGateway, UserId } from "@/application/ports/auth-gateway";
import type { RestaurantDirectory, RestaurantSummary } from "@/application/ports/restaurant-directory";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok } from "@/domain/shared/result";
import { makeGetFounderContext, makeListRestaurants, makeSignInFounder } from "./founder-access";

const FOUNDER = "user-founder" as UserId;
const OWNER = "user-owner" as UserId;
const ACCOUNTS: Record<string, UserId> = { "founder@platform.test": FOUNDER, "owner@grill.test": OWNER };

function world(signedIn: UserId | null = null) {
  const state = { current: signedIn, signOuts: 0, listed: 0 };
  const auth: AuthGateway = {
    async signInWithPassword(email, password) {
      const id = ACCOUNTS[email];
      if (!id || password !== "right-password") return err({ type: "INVALID_CREDENTIALS" });
      state.current = id;
      return ok({ userId: id });
    },
    currentUserId: async () => state.current,
    async signOut() {
      state.current = null;
      state.signOuts++;
    },
  };
  const summary: RestaurantSummary = { id: "r-1" as RestaurantId, slug: "grill", name: { en: "Grill", ar: "مشاوي" }, createdAt: new Date("2026-10-11T10:00:00Z") };
  const restaurants: Pick<RestaurantDirectory, "list"> = {
    async list() {
      state.listed++;
      return [summary];
    },
  };
  const deps = { auth, admins: { isAdmin: async (userId: UserId) => userId === FOUNDER }, restaurants: restaurants as RestaurantDirectory };
  return { deps, state, summary };
}

describe("founder sign-in", () => {
  it("signs a founder in (email tidied)", async () => {
    const { deps, state } = world();
    expect(await makeSignInFounder(deps)({ email: "  Founder@Platform.test ", password: "right-password" })).toEqual({ ok: true, value: { userId: FOUNDER } });
    expect(state.current).toBe(FOUNDER);
  });

  it("answers a restaurant's staff like a wrong password, and leaves them signed out", async () => {
    const { deps, state } = world();
    const refused = { ok: false, error: { type: "INVALID_CREDENTIALS" } };
    expect(await makeSignInFounder(deps)({ email: "owner@grill.test", password: "right-password" })).toEqual(refused);
    expect(state.current).toBeNull();
    expect(state.signOuts).toBe(1);
    expect(await makeSignInFounder(deps)({ email: "founder@platform.test", password: "wrong" })).toEqual(refused);
    expect(await makeSignInFounder(deps)({ email: "", password: "right-password" })).toEqual(refused);
  });
});

describe("founder context and the list of restaurants", () => {
  it("lets a founder in and lists the restaurants", async () => {
    const { deps, summary } = world(FOUNDER);
    expect(await makeGetFounderContext(deps)()).toEqual({ ok: true, value: { userId: FOUNDER } });
    expect(await makeListRestaurants(deps)()).toEqual({ ok: true, value: [summary] });
  });

  it("keeps everybody else out without touching the list", async () => {
    for (const [who, error] of [[null, "NOT_SIGNED_IN"], [OWNER, "NOT_A_FOUNDER"]] as const) {
      const { deps, state } = world(who);
      expect(await makeGetFounderContext(deps)()).toEqual({ ok: false, error: { type: error } });
      expect(await makeListRestaurants(deps)()).toEqual({ ok: false, error: { type: error } });
      expect(state.listed).toBe(0);
    }
  });
});
