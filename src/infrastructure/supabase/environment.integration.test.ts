// Guard for the CI database job: every other integration test SKIPS itself when the Supabase settings are missing
// (so `npm test` works without a database). In the database job that would turn a broken setup into a silent green
// run, so there REQUIRE_SUPABASE=1 makes the missing settings a failure instead.
// Run: `npm run test:integration` (loads .env.local). Does nothing unless REQUIRE_SUPABASE=1.
import { describe, expect, it } from "vitest";

describe.runIf(process.env.REQUIRE_SUPABASE === "1")("the database job has a real Supabase to test against", () => {
  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"])(
    "%s is set",
    (name) => {
      expect(process.env[name], `${name} is missing, so the integration tests would be skipped`).toBeTruthy();
    },
  );

  it("can reach the database", async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" },
    });
    expect(response.status).toBeLessThan(500);
  });
});
