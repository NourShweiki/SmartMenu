// Runs the real adapters against the LOCAL Supabase (seeded demo staff).
// Run: `npm run test:integration` (loads .env.local). Plain `npm test` and CI don't load
// .env.local, so these are skipped there and never need a database.
import { describe, expect, it } from "vitest";
import { makeSignInStaff } from "@/application/use-cases/sign-in-staff";
import { makeGetStaffContext } from "@/application/use-cases/get-staff-context";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient } from "./client";
import { SupabaseAuthGateway } from "./supabase-auth-gateway";
import { SupabaseMembershipRepository } from "./supabase-membership-repository";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql

function adapters() {
  const db = createPublicClient(); // in-memory session, one per test
  return { auth: new SupabaseAuthGateway(db), memberships: new SupabaseMembershipRepository(db) };
}

describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("staff auth against local Supabase", () => {
  it("signs in the Demo Grill waiter with role WAITER", async () => {
    const deps = adapters();
    const result = await makeSignInStaff(deps)({ restaurantId: GRILL, email: "waiter@demo-dinein.test", password: PASSWORD });
    expect(result.ok && result.value.role).toBe("WAITER");
    expect((await makeGetStaffContext(deps)({ restaurantId: GRILL })).ok).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const result = await makeSignInStaff(adapters())({ restaurantId: GRILL, email: "waiter@demo-dinein.test", password: "nope-nope-nope" });
    expect(result).toEqual({ ok: false, error: { type: "INVALID_CREDENTIALS" } });
  });

  it("refuses Demo Grill staff on Demo Coffee and leaves them signed out", async () => {
    const deps = adapters();
    const result = await makeSignInStaff(deps)({ restaurantId: COFFEE, email: "owner@demo-dinein.test", password: PASSWORD });
    expect(result).toEqual({ ok: false, error: { type: "INVALID_CREDENTIALS" } });
    expect(await deps.auth.currentUserId()).toBeNull();
  });
});
