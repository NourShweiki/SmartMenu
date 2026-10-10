// Runs the real branding adapter and the real logo bucket against the LOCAL Supabase (seeded demo restaurants).
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// Never changes a restaurant's branding VALUES (demo data is shared with the dev server): it writes the same
// values back, and only uploads + deletes a temporary logo file. Different values / refusals / atomicity are
// proven in rolled-back transactions by pgTAP (branding.test.sql).
import { describe, expect, it } from "vitest";
import { logoPath, validateLogo } from "@/domain/restaurant/branding";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createPublicClient } from "./client";
import { SupabaseBrandingRepository } from "./supabase-branding-repository";
import { LOGOS_BUCKET, SupabasePhotoStorage } from "./supabase-photo-storage";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
// A real 1x1 PNG.
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

async function signedIn(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return db;
}

describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("branding against local Supabase", () => {
  it("lets the owner read and save (unchanged values) while a waiter and another restaurant are refused", async () => {
    const owner = new SupabaseBrandingRepository(await signedIn("owner@demo-dinein.test"));
    const current = await owner.find(GRILL);
    if (!current) throw new Error("demo restaurant missing");
    expect(current.name.en.length).toBeGreaterThan(0);

    expect(await owner.save(GRILL, current)).toBe(true); // same values back: allowed, nothing changes
    expect(await owner.find(GRILL)).toEqual(current);

    const waiter = new SupabaseBrandingRepository(await signedIn("waiter@demo-dinein.test"));
    expect(await waiter.save(GRILL, { ...current, name: { ...current.name, en: "Hacked" } })).toBe(false);
    expect(await owner.find(GRILL)).toEqual(current);

    expect(await owner.find(COFFEE)).toBeNull(); // RLS: not their restaurant
    expect(await owner.save(COFFEE, current)).toBe(false);
  });

  it("uploads a logo into the owner's own folder, serves it publicly, removes it; a waiter cannot", async () => {
    const type = validateLogo({ head: PNG.subarray(0, 16), sizeBytes: PNG.byteLength });
    if (!type.ok) throw new Error("test png rejected");
    const path = logoPath(GRILL, `it-${crypto.randomUUID()}`, type.value);

    const ownerDb = await signedIn("owner@demo-dinein.test");
    const logos = new SupabasePhotoStorage(ownerDb, LOGOS_BUCKET);
    const waiterLogos = new SupabasePhotoStorage(await signedIn("waiter@demo-dinein.test"), LOGOS_BUCKET);
    const otherFolder = logoPath(COFFEE, `it-${crypto.randomUUID()}`, type.value);

    await expect(waiterLogos.upload(path, PNG, type.value.contentType)).rejects.toThrow(); // only the owner writes
    await expect(logos.upload(otherFolder, PNG, type.value.contentType)).rejects.toThrow(); // only their own folder

    try {
      await logos.upload(path, PNG, type.value.contentType);
      const response = await fetch(logos.publicUrl(path)); // no login: the bucket is public
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
    } finally {
      await logos.remove(path);
    }
    expect((await fetch(logos.publicUrl(path))).status).not.toBe(200);
  });
});
