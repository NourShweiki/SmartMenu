import { describe, expect, it } from "vitest";
import type { AuthGateway, UserId } from "@/application/ports/auth-gateway";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import { err, ok } from "@/domain/shared/result";
import { makeGetStaffContext } from "./get-staff-context";
import { makeSignInStaff } from "./sign-in-staff";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const OWNER = "user-owner" as UserId;

/** In-memory auth: one account per email, password "right-password". */
function fakeAuth(accounts: Record<string, UserId>, signedIn: UserId | null = null) {
  const state = { current: signedIn, signOuts: 0, attempts: [] as string[] };
  const auth: AuthGateway = {
    async signInWithPassword(email, password) {
      state.attempts.push(email);
      const id = accounts[email];
      if (!id || password !== "right-password") return err({ type: "INVALID_CREDENTIALS" });
      state.current = id;
      return ok({ userId: id });
    },
    async currentUserId() {
      return state.current;
    },
    async signOut() {
      state.current = null;
      state.signOuts++;
    },
  };
  return { auth, state };
}

function fakeMemberships(rows: { restaurantId: RestaurantId; userId: UserId; role: Role }[]): MembershipRepository {
  return {
    async findRole(restaurantId, userId) {
      return rows.find((r) => r.restaurantId === restaurantId && r.userId === userId)?.role ?? null;
    },
  };
}

const memberships = fakeMemberships([{ restaurantId: GRILL, userId: OWNER, role: "OWNER" }]);

describe("signInStaff", () => {
  it("signs in a member and returns their role in this restaurant", async () => {
    const { auth } = fakeAuth({ "owner@grill.test": OWNER });
    const result = await makeSignInStaff({ auth, memberships })({
      restaurantId: GRILL,
      email: "  Owner@Grill.test ",
      password: "right-password",
    });
    expect(result).toEqual({ ok: true, value: { userId: OWNER, restaurantId: GRILL, role: "OWNER" } });
  });

  it("rejects a wrong password", async () => {
    const { auth } = fakeAuth({ "owner@grill.test": OWNER });
    const result = await makeSignInStaff({ auth, memberships })({
      restaurantId: GRILL,
      email: "owner@grill.test",
      password: "wrong",
    });
    expect(result).toEqual({ ok: false, error: { type: "INVALID_CREDENTIALS" } });
  });

  it("signs out a valid account that is not staff of this restaurant, with the same error", async () => {
    const { auth, state } = fakeAuth({ "owner@grill.test": OWNER });
    const result = await makeSignInStaff({ auth, memberships })({
      restaurantId: COFFEE,
      email: "owner@grill.test",
      password: "right-password",
    });
    expect(result).toEqual({ ok: false, error: { type: "INVALID_CREDENTIALS" } });
    expect(state.signOuts).toBe(1);
    expect(state.current).toBeNull();
  });

  it("does not call auth for an empty email or password", async () => {
    const { auth, state } = fakeAuth({ "owner@grill.test": OWNER });
    const signIn = makeSignInStaff({ auth, memberships });
    expect((await signIn({ restaurantId: GRILL, email: " ", password: "x" })).ok).toBe(false);
    expect((await signIn({ restaurantId: GRILL, email: "owner@grill.test", password: "" })).ok).toBe(false);
    expect(state.attempts).toEqual([]);
  });
});

describe("getStaffContext", () => {
  it("returns NOT_SIGNED_IN when nobody is signed in", async () => {
    const { auth } = fakeAuth({});
    expect(await makeGetStaffContext({ auth, memberships })({ restaurantId: GRILL })).toEqual({
      ok: false,
      error: { type: "NOT_SIGNED_IN" },
    });
  });

  it("returns the role for a signed-in member", async () => {
    const { auth } = fakeAuth({}, OWNER);
    expect(await makeGetStaffContext({ auth, memberships })({ restaurantId: GRILL })).toEqual({
      ok: true,
      value: { userId: OWNER, restaurantId: GRILL, role: "OWNER" },
    });
  });

  it("returns NOT_A_MEMBER for a signed-in user of another restaurant", async () => {
    const { auth } = fakeAuth({}, OWNER);
    expect(await makeGetStaffContext({ auth, memberships })({ restaurantId: COFFEE })).toEqual({
      ok: false,
      error: { type: "NOT_A_MEMBER" },
    });
  });
});
