import { describe, expect, it } from "vitest";
import type { AccountDirectory } from "@/application/ports/account-directory";
import type { AuthGateway, UserId } from "@/application/ports/auth-gateway";
import type { RestaurantClash, RestaurantDirectory, StoreRestaurantError } from "@/application/ports/restaurant-directory";
import type { Restaurant } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import { makeCreateRestaurant, type CreateRestaurantRequest } from "./create-restaurant";

const FOUNDER = "user-founder" as UserId;
const STAFF = "user-staff" as UserId;
const NEW_ID = "99999999-9999-4000-8000-000000000001";
const NOW = new Date("2026-10-11T10:00:00Z");

const request: CreateRestaurantRequest = {
  id: NEW_ID,
  slug: "falafel-house",
  name: { en: "Falafel House", ar: "بيت الفلافل" },
  businessType: "takeout",
  ownerEmail: "  Owner@Falafel.Test ",
};

/** Everything the use case talks to, in memory, with a record of what happened. */
function world(options: {
  signedIn?: UserId | null;
  clash?: RestaurantClash | null;
  takenEmails?: string[];
  refusedEmails?: string[];
  store?: () => Promise<Result<void, StoreRestaurantError>>;
} = {}) {
  const log = {
    accounts: new Map<string, { email: string; password: string }>(),
    removed: [] as string[],
    stored: [] as { actorId: UserId; restaurant: Restaurant; ownerId: UserId }[],
  };
  const signedIn = options.signedIn === undefined ? FOUNDER : options.signedIn;
  const auth: AuthGateway = {
    signInWithPassword: async () => err({ type: "INVALID_CREDENTIALS" }),
    currentUserId: async () => signedIn,
    signOut: async () => {},
  };
  const accounts: AccountDirectory = {
    async create(email, password) {
      if (options.takenEmails?.includes(email)) return err({ type: "EMAIL_TAKEN" });
      if (options.refusedEmails?.includes(email)) return err({ type: "INVALID_EMAIL" });
      const userId = `account-${log.accounts.size + 1}` as UserId;
      log.accounts.set(userId, { email, password });
      return ok({ userId });
    },
    async remove(userId) {
      log.accounts.delete(userId);
      log.removed.push(userId);
    },
  };
  const restaurants: RestaurantDirectory = {
    list: async () => [],
    clash: async () => options.clash ?? null,
    async create(actorId, restaurant, ownerId) {
      if (options.store) return options.store();
      log.stored.push({ actorId, restaurant, ownerId });
      return ok(undefined);
    },
  };
  const create = makeCreateRestaurant({
    auth,
    admins: { isAdmin: async (userId) => userId === FOUNDER },
    accounts,
    restaurants,
    passwords: { newPassword: () => "temp-pass-word" },
    clock: { now: () => NOW },
  });
  return { create, log };
}

describe("createRestaurant (founders' setup tool)", () => {
  it("creates the restaurant from its business-type preset, with an owner account and a temporary password", async () => {
    const { create, log } = world();
    const result = await create(request);

    expect(result).toEqual({
      ok: true,
      value: {
        restaurant: {
          id: NEW_ID,
          slug: "falafel-house",
          name: { en: "Falafel House", ar: "بيت الفلافل" },
          settings: { dineInEnabled: false, takeoutEnabled: true, deliveryEnabled: false, taxRateBp: 1600, serviceChargeBp: 0, defaultLanguage: "ar" },
          createdAt: NOW,
        },
        ownerEmail: "owner@falafel.test",
        temporaryPassword: "temp-pass-word",
      },
    });
    // The account was made with the tidied email and that password, and is the restaurant's owner.
    expect([...log.accounts.values()]).toEqual([{ email: "owner@falafel.test", password: "temp-pass-word" }]);
    expect(log.stored).toHaveLength(1);
    expect(log.stored[0]).toMatchObject({ actorId: FOUNDER, ownerId: "account-1" });
    expect(log.removed).toEqual([]);
  });

  it("gives a dine-in business table service and a service charge", async () => {
    const result = await world().create({ ...request, businessType: "dine-in" });
    expect(result.ok && result.value.restaurant.settings).toMatchObject({ dineInEnabled: true, takeoutEnabled: true, serviceChargeBp: 1000 });
  });

  it("is for founders only", async () => {
    const nobody = world({ signedIn: null });
    expect(await nobody.create(request)).toEqual({ ok: false, error: { type: "NOT_SIGNED_IN" } });
    const staff = world({ signedIn: STAFF });
    expect(await staff.create(request)).toEqual({ ok: false, error: { type: "NOT_A_FOUNDER" } });
    for (const { log } of [nobody, staff]) {
      expect(log.accounts.size).toBe(0);
      expect(log.stored).toEqual([]);
    }
  });

  it("refuses bad input before anything is created", async () => {
    const cases: [Partial<CreateRestaurantRequest>, unknown][] = [
      [{ id: "not-an-id" }, { type: "INVALID_ID" }],
      [{ ownerEmail: "owner-at-falafel" }, { type: "INVALID_EMAIL" }],
      [{ ownerEmail: "two words@falafel.test" }, { type: "INVALID_EMAIL" }],
      [{ ownerEmail: "   " }, { type: "INVALID_EMAIL" }],
      [{ ownerEmail: `${"a".repeat(250)}@x.jo` }, { type: "INVALID_EMAIL" }],
      [{ slug: "Falafel House!" }, { type: "INVALID_SLUG", reason: "FORMAT" }],
      [{ slug: "admin" }, { type: "INVALID_SLUG", reason: "RESERVED" }],
      [{ name: { en: "Falafel House", ar: "  " } }, { type: "NAME_REQUIRED", lang: "ar" }],
    ];
    for (const [change, error] of cases) {
      const { create, log } = world();
      expect(await create({ ...request, ...change })).toEqual({ ok: false, error });
      expect(log.accounts.size).toBe(0);
      expect(log.stored).toEqual([]);
    }
  });

  it("answers ALREADY_CREATED when the same form is sent again, and SLUG_TAKEN for somebody else's address", async () => {
    const again = world({ clash: "SAME_ID" });
    expect(await again.create(request)).toEqual({ ok: false, error: { type: "ALREADY_CREATED" } });
    const taken = world({ clash: "SLUG" });
    expect(await taken.create(request)).toEqual({ ok: false, error: { type: "SLUG_TAKEN" } });
    for (const { log } of [again, taken]) {
      expect(log.accounts.size).toBe(0); // no account was made for nothing
      expect(log.stored).toEqual([]);
    }
  });

  it("refuses an email that already has an account, or that the sign-in service will not take, storing nothing", async () => {
    const { create, log } = world({ takenEmails: ["owner@falafel.test"] });
    expect(await create(request)).toEqual({ ok: false, error: { type: "EMAIL_TAKEN" } });
    expect(log.stored).toEqual([]);

    const strict = world({ refusedEmails: ["owner@falafel.test"] });
    expect(await strict.create(request)).toEqual({ ok: false, error: { type: "INVALID_EMAIL" } });
    expect(strict.log.stored).toEqual([]);
  });

  it("removes the new account again when the restaurant cannot be stored", async () => {
    // Another founder took the address between the check and the write.
    const raced = world({ store: async () => err({ type: "SLUG_TAKEN" }) });
    expect(await raced.create(request)).toEqual({ ok: false, error: { type: "SLUG_TAKEN" } });
    expect(raced.log.accounts.size).toBe(0);
    expect(raced.log.removed).toEqual(["account-1"]);

    // The store broke: the error is passed on, and the account is still cleaned up.
    const broken = world({
      store: async () => {
        throw new Error("database is down");
      },
    });
    await expect(broken.create(request)).rejects.toThrow("database is down");
    expect(broken.log.accounts.size).toBe(0);
    expect(broken.log.removed).toEqual(["account-1"]);
  });
});
