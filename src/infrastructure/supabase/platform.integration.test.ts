// The founders' "new restaurant" path against the LOCAL Supabase: real auth admin API, real create_restaurant.
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// Everything it makes is named "itest-..." and is removed before and after, so the demo data stays as it was.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserId } from "@/application/ports/auth-gateway";
import { makeCreateRestaurant, type CreateRestaurantRequest } from "@/application/use-cases/platform/create-restaurant";
import { createRestaurant, type RestaurantId } from "@/domain/restaurant/restaurant";
import { newTemporaryPassword } from "../random-token";
import { createPublicClient, createServiceClient } from "./client";
import { SupabaseAccountDirectory } from "./supabase-account-directory";
import { SupabaseAuthGateway } from "./supabase-auth-gateway";
import { SupabaseMembershipRepository } from "./supabase-membership-repository";
import { SupabasePlatformAdminRepository } from "./supabase-platform-admin-repository";
import { SupabaseRestaurantDirectory } from "./supabase-restaurant-directory";
import { SupabaseRestaurantRepository } from "./supabase-restaurant-repository";

const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
const FOUNDER = "cccc0001-0000-4000-8000-000000000001" as UserId;
const GRILL_OWNER = "aaaa0001-0000-4000-8000-000000000001" as UserId;
const run = crypto.randomUUID().slice(0, 8);

/** The use case wired as the container wires it, for whoever signs in with this email. */
async function setupToolFor(email: string) {
  const db = createPublicClient(); // in-memory session
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const service = createServiceClient();
  return makeCreateRestaurant({
    auth: new SupabaseAuthGateway(db),
    admins: new SupabasePlatformAdminRepository(db),
    accounts: new SupabaseAccountDirectory(service),
    restaurants: new SupabaseRestaurantDirectory(service),
    passwords: { newPassword: newTemporaryPassword },
    clock: { now: () => new Date() },
  });
}

const request = (change: Partial<CreateRestaurantRequest> = {}): CreateRestaurantRequest => ({
  id: crypto.randomUUID(),
  slug: `itest-${run}-cafe`,
  name: { en: "Integration Cafe", ar: "مقهى الاختبار" },
  businessType: "takeout",
  ownerEmail: `itest-${run}-owner@test.local`,
  ...change,
});

async function sweep() {
  const service = createServiceClient();
  const { error } = await service.from("restaurants").delete().like("slug", "itest-%"); // settings and members go with it
  if (error) throw error;
  const { data, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  for (const user of data.users) {
    if (user.email?.startsWith("itest-")) await service.auth.admin.deleteUser(user.id);
  }
}

const emailExists = async (email: string) => {
  const { data, error } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.some((user) => user.email === email);
};

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("founders' setup tool against local Supabase", () => {
  beforeAll(sweep);
  afterAll(sweep);

  it("knows who is a founder, each user only for themselves", async () => {
    const asFounder = createPublicClient();
    await asFounder.auth.signInWithPassword({ email: "founder@demo-platform.test", password: PASSWORD });
    expect(await new SupabasePlatformAdminRepository(asFounder).isAdmin(FOUNDER)).toBe(true);

    const asOwner = createPublicClient();
    await asOwner.auth.signInWithPassword({ email: "owner@demo-dinein.test", password: PASSWORD });
    const admins = new SupabasePlatformAdminRepository(asOwner);
    expect(await admins.isAdmin(GRILL_OWNER)).toBe(false);
    expect(await admins.isAdmin(FOUNDER)).toBe(false); // RLS: nobody else can see who the founders are
  });

  it("a founder creates a restaurant; its owner signs in with the temporary password; sending the form again creates nothing", async () => {
    const create = await setupToolFor("founder@demo-platform.test");
    const first = request();
    const result = await create(first);
    if (!result.ok) throw new Error(`expected a restaurant, got ${JSON.stringify(result.error)}`);
    const { restaurant, ownerEmail, temporaryPassword } = result.value;

    // Public side: the new address answers, with the takeout preset.
    const found = await new SupabaseRestaurantRepository(createPublicClient()).findPublicBySlug(first.slug);
    expect(found?.id).toBe(first.id);
    expect(found?.name).toEqual(first.name);
    expect(found?.settings).toEqual({ dineInEnabled: false, takeoutEnabled: true, deliveryEnabled: false, taxRateBp: 1600, serviceChargeBp: 0, defaultLanguage: "ar" });

    // The owner signs in with what the founder was shown, and is the OWNER there (and nowhere else).
    const asOwner = createPublicClient();
    const signedIn = await asOwner.auth.signInWithPassword({ email: ownerEmail, password: temporaryPassword });
    expect(signedIn.error).toBeNull();
    const memberships = new SupabaseMembershipRepository(asOwner);
    const ownerId = signedIn.data.user!.id as UserId;
    expect(await memberships.findRole(restaurant.id, ownerId)).toBe("OWNER");
    expect(await memberships.findRole("11111111-1111-4000-8000-000000000001" as RestaurantId, ownerId)).toBeNull();

    // The same form again (same id): nothing new. Another form with the same address: taken. No stray accounts.
    expect(await create(first)).toEqual({ ok: false, error: { type: "ALREADY_CREATED" } });
    const other = request({ ownerEmail: `itest-${run}-second@test.local` });
    expect(await create(other)).toEqual({ ok: false, error: { type: "SLUG_TAKEN" } });
    expect(await emailExists(other.ownerEmail)).toBe(false);
    // A free address, but the owner's email already has an account.
    const sameOwner = request({ slug: `itest-${run}-two` });
    expect(await create(sameOwner)).toEqual({ ok: false, error: { type: "EMAIL_TAKEN" } });
    expect(await new SupabaseRestaurantRepository(createPublicClient()).findPublicBySlug(sameOwner.slug)).toBeNull();
  });

  it("refuses restaurant staff: nothing is created", async () => {
    const create = await setupToolFor("owner@demo-dinein.test");
    const attempt = request({ slug: `itest-${run}-nope`, ownerEmail: `itest-${run}-nope@test.local` });
    expect(await create(attempt)).toEqual({ ok: false, error: { type: "NOT_A_FOUNDER" } });
    expect(await new SupabaseRestaurantRepository(createPublicClient()).findPublicBySlug(attempt.slug)).toBeNull();
    expect(await emailExists(attempt.ownerEmail)).toBe(false);
  });

  it("the store itself refuses a non-founder, a taken address and a repeated id (the checks behind the checks)", async () => {
    const service = createServiceClient();
    const directory = new SupabaseRestaurantDirectory(service);
    const accounts = new SupabaseAccountDirectory(service);
    const draft = (id: string, slug: string) => {
      const made = createRestaurant({ slug, name: { en: "Store Test", ar: "اختبار" }, businessType: "dine-in" }, { newId: () => id, now: () => new Date() });
      if (!made.ok) throw new Error("bad test restaurant");
      return made.value;
    };
    const account = await accounts.create(`itest-${run}-store@test.local`, newTemporaryPassword());
    if (!account.ok) throw new Error("could not make the test account");
    const ownerId = account.value.userId;
    expect(await accounts.create(`itest-${run}-store@test.local`, newTemporaryPassword())).toEqual({ ok: false, error: { type: "EMAIL_TAKEN" } });

    // An address that looks fine at a glance but the sign-in service will not take.
    expect(await accounts.create(`itest-${run}-odd@bad..test`, newTemporaryPassword())).toEqual({ ok: false, error: { type: "INVALID_EMAIL" } });

    const id = crypto.randomUUID();
    const slug = `itest-${run}-store`;
    expect(await directory.clash(id as RestaurantId, slug)).toBeNull();
    expect(await directory.create(GRILL_OWNER, draft(id, slug), ownerId)).toEqual({ ok: false, error: { type: "NOT_A_FOUNDER" } });
    expect(await directory.clash(id as RestaurantId, slug)).toBeNull(); // the refusal stored nothing

    expect((await directory.create(FOUNDER, draft(id, slug), ownerId)).ok).toBe(true);
    expect(await directory.clash(id as RestaurantId, `itest-${run}-free`)).toBe("SAME_ID");
    expect(await directory.clash(crypto.randomUUID() as RestaurantId, slug)).toBe("SLUG");
    expect(await directory.create(FOUNDER, draft(id, `itest-${run}-free`), ownerId)).toEqual({ ok: false, error: { type: "ALREADY_CREATED" } });
    expect(await directory.create(FOUNDER, draft(crypto.randomUUID(), slug), ownerId)).toEqual({ ok: false, error: { type: "SLUG_TAKEN" } });

    await accounts.remove(ownerId);
    expect(await emailExists(`itest-${run}-store@test.local`)).toBe(false);
  });
});
