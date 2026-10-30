// The sign-in attempt limit with the real adapters against the LOCAL Supabase (seeded demo staff).
// Run: `npm run test:integration` (loads .env.local). Cleans up the failures it records.
import { afterAll, describe, expect, it } from "vitest";
import { makeLimitedSignIn } from "@/application/use-cases/limit-sign-in";
import { makeSignInStaff } from "@/application/use-cases/sign-in-staff";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { MAX_FAILURES_PER_ACCOUNT, signInKeys } from "@/domain/shared/sign-in-limit";
import { createPublicClient, createServiceClient } from "./client";
import { SupabaseAuthGateway } from "./supabase-auth-gateway";
import { SupabaseMembershipRepository } from "./supabase-membership-repository";
import { SupabaseSignInAttemptLog } from "./supabase-sign-in-attempt-log";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
const EMAIL = "waiter@demo-dinein.test";
// A visitor of this test run only, so nothing else is counted against it.
const VISITOR = `integration-${crypto.randomUUID()}`;

describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("sign-in attempt limit against local Supabase", () => {
  const log = () => new SupabaseSignInAttemptLog(createServiceClient());
  const signIn = () => {
    const db = createPublicClient(); // in-memory session, one per attempt
    const staff = makeSignInStaff({ auth: new SupabaseAuthGateway(db), memberships: new SupabaseMembershipRepository(db) });
    return makeLimitedSignIn({ attempts: log(), clock: { now: () => new Date() } }, staff);
  };
  const keys = signInKeys(EMAIL, VISITOR);

  afterAll(async () => {
    await log().clearFailures(keys.account);
    await log().clearFailures(keys.visitor!);
  });

  it("stores failures under hashed keys, counts them and forgets them", async () => {
    const store = log();
    const before = new Date(Date.now() - 1000);
    await store.recordFailure([keys.visitor!], new Date());
    expect(await store.countFailures([keys.visitor!, "account:nobody@test.local"], before)).toEqual({ [keys.visitor!]: 1 });

    // Nothing readable is stored: the row holds a hash, not the key.
    const { data } = await createServiceClient().from("sign_in_failures").select("key_hash").like("key_hash", "%integration%");
    expect(data).toEqual([]);

    await store.clearFailures(keys.visitor!);
    expect(await store.countFailures([keys.visitor!], before)).toEqual({});
  });

  it("after 5 wrong passwords the real waiter account is refused even with the right one, until cleared", async () => {
    await log().clearFailures(keys.account); // start clean, whatever ran before
    const attempt = (password: string) => signIn()({ restaurantId: GRILL, email: EMAIL, password, visitorHash: VISITOR });

    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) expect(await attempt("not-the-password")).toEqual({ ok: false, error: { type: "INVALID_CREDENTIALS" } });
    expect(await attempt(PASSWORD)).toEqual({ ok: false, error: { type: "TOO_MANY_ATTEMPTS" } });

    await log().clearFailures(keys.account);
    await log().clearFailures(keys.visitor!);
    const result = await attempt(PASSWORD);
    expect(result.ok && result.value.role).toBe("WAITER");
  });
});
