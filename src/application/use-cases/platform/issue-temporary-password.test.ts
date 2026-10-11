import { describe, expect, it } from "vitest";
import type { AuthGateway, UserId } from "@/application/ports/auth-gateway";
import type { RestaurantDirectory, RestaurantOwner } from "@/application/ports/restaurant-directory";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err } from "@/domain/shared/result";
import { makeIssueTemporaryPassword } from "./issue-temporary-password";

const FOUNDER = "ffffffff-0000-4000-8000-000000000001" as UserId;
const OTHER_FOUNDER = "ffffffff-0000-4000-8000-000000000002";
const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const GRILL_OWNER = "aaaa0001-0000-4000-8000-000000000001" as UserId;
const COFFEE_OWNER = "bbbb0001-0000-4000-8000-000000000001" as UserId;

const OWNERS: RestaurantOwner[] = [
  { restaurantId: GRILL, userId: GRILL_OWNER, email: "owner@grill.test" },
  { restaurantId: COFFEE, userId: COFFEE_OWNER, email: "owner@coffee.test" },
];

function world(signedIn: UserId | null = FOUNDER) {
  const state = { set: [] as { userId: string; password: string }[], asked: [] as (string | undefined)[] };
  const auth: AuthGateway = {
    signInWithPassword: async () => err({ type: "INVALID_CREDENTIALS" }),
    currentUserId: async () => signedIn,
    currentUser: async () => signedIn && { userId: signedIn, email: "someone@test", mustChangePassword: false },
    signOut: async () => {},
  };
  const restaurants: Pick<RestaurantDirectory, "owners"> = {
    async owners(_actorId, restaurantId) {
      state.asked.push(restaurantId);
      return OWNERS.filter((o) => !restaurantId || o.restaurantId === restaurantId);
    },
  };
  const issue = makeIssueTemporaryPassword({
    auth,
    admins: { isAdmin: async (userId) => userId === FOUNDER },
    restaurants: restaurants as RestaurantDirectory,
    accounts: {
      async setTemporaryPassword(userId, password) {
        state.set.push({ userId, password });
      },
    },
    passwords: { newPassword: () => "temp-pass-word" },
  });
  return { issue, state };
}

describe("issueTemporaryPassword (founders' setup tool)", () => {
  it("gives the restaurant's owner a new temporary password and tells the founder what it is", async () => {
    const { issue, state } = world();
    expect(await issue({ restaurantId: GRILL, ownerId: GRILL_OWNER })).toEqual({
      ok: true,
      value: { ownerEmail: "owner@grill.test", temporaryPassword: "temp-pass-word" },
    });
    expect(state.set).toEqual([{ userId: GRILL_OWNER, password: "temp-pass-word" }]);
    expect(state.asked).toEqual([GRILL]); // only that restaurant's owners were looked at
  });

  it("only resets an account that is an owner of THAT restaurant", async () => {
    const { issue, state } = world();
    const refused = { ok: false, error: { type: "NOT_AN_OWNER" } };
    expect(await issue({ restaurantId: GRILL, ownerId: COFFEE_OWNER })).toEqual(refused); // another restaurant's owner
    expect(await issue({ restaurantId: GRILL, ownerId: OTHER_FOUNDER })).toEqual(refused); // some other account
    expect(await issue({ restaurantId: GRILL, ownerId: FOUNDER })).toEqual(refused); // the founder themselves
    expect(await issue({ restaurantId: "not-an-id", ownerId: GRILL_OWNER })).toEqual(refused);
    expect(await issue({ restaurantId: GRILL, ownerId: "' or 1=1 --" })).toEqual(refused);
    expect(state.set).toEqual([]);
  });

  it("is for founders only", async () => {
    const nobody = world(null);
    expect(await nobody.issue({ restaurantId: GRILL, ownerId: GRILL_OWNER })).toEqual({ ok: false, error: { type: "NOT_SIGNED_IN" } });
    const owner = world(GRILL_OWNER);
    expect(await owner.issue({ restaurantId: GRILL, ownerId: GRILL_OWNER })).toEqual({ ok: false, error: { type: "NOT_A_FOUNDER" } });
    for (const { state } of [nobody, owner]) {
      expect(state.set).toEqual([]);
      expect(state.asked).toEqual([]);
    }
  });
});
