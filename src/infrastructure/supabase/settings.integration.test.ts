// Runs the real settings adapter against the LOCAL Supabase (seeded demo restaurants + staff).
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// NEVER changes a setting's value: the demo data is shared with the dev server and other test files,
// and a killed run must not leave it altered. Writing a *different* value (owner allowed, waiter refused,
// other restaurant refused, bad value rejected) is proven inside rolled-back transactions by the pgTAP
// tests (`npx supabase test db`, tenant_isolation.test.sql).
import { describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient } from "./client";
import { SupabaseSettingsRepository } from "./supabase-settings-repository";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql

async function repoFor(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return new SupabaseSettingsRepository(db);
}

describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("settings repository against local Supabase", () => {
  it("reads the settings of the owner's restaurant and accepts an unchanged write", async () => {
    const repo = await repoFor("owner@demo-dinein.test");
    const current = await repo.find(GRILL);
    if (!current) throw new Error("demo settings missing");
    expect(Number.isInteger(current.taxRateBp)).toBe(true);
    expect(Number.isInteger(current.serviceChargeBp)).toBe(true);
    // Same values written back: proves the owner may update (RLS returns the row) without altering any data.
    expect(await repo.update(GRILL, current)).toBe(true);
    expect(await repo.find(GRILL)).toEqual(current);
  });

  it("refuses a waiter's update and another restaurant's settings", async () => {
    const owner = await repoFor("owner@demo-dinein.test");
    const original = await owner.find(GRILL);
    if (!original) throw new Error("demo settings missing");

    const waiter = await repoFor("waiter@demo-dinein.test");
    expect(await waiter.find(GRILL)).toEqual(original); // staff can read...
    expect(await waiter.update(GRILL, { ...original, taxRateBp: original.taxRateBp + 1 })).toBe(false); // ...not change
    expect(await owner.find(GRILL)).toEqual(original);

    expect(await owner.find(COFFEE)).toBeNull(); // RLS: not their restaurant
    expect(await owner.update(COFFEE, original)).toBe(false);
  });
});
