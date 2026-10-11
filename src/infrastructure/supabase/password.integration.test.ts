// "Change my password" against the LOCAL Supabase: the real sign-in service, the real temporary-password mark.
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// It only ever touches an account it makes itself ("itest-pw-..."), removed before and after. The demo accounts'
// passwords are never changed: the other tests and the demo depend on them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeChangeOwnPassword } from "@/application/use-cases/change-own-password";
import { newTemporaryPassword } from "../random-token";
import { createPublicClient, createServiceClient } from "./client";
import { SupabaseAccountDirectory } from "./supabase-account-directory";
import { SupabaseAuthGateway } from "./supabase-auth-gateway";
import { SupabasePasswordGateway } from "./supabase-password-gateway";

const DEMO_PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
const email = `itest-pw-${crypto.randomUUID().slice(0, 8)}@test.local`;

async function sweep() {
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  for (const user of data.users) {
    if (user.email?.startsWith("itest-pw-")) await service.auth.admin.deleteUser(user.id);
  }
}

const canSignIn = async (password: string) => !(await createPublicClient().auth.signInWithPassword({ email, password })).error;

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("changing one's own password against local Supabase", () => {
  beforeAll(sweep);
  afterAll(sweep);

  it("a new account's password is temporary until its owner replaces it; the old one then stops working", async () => {
    const accounts = new SupabaseAccountDirectory(createServiceClient());
    const temporary = newTemporaryPassword();
    const made = await accounts.create(email, temporary);
    if (!made.ok) throw new Error("could not make the test account");

    // The owner signs in (their session lives in `db`, as the cookie session does in the app).
    const db = createPublicClient();
    expect((await db.auth.signInWithPassword({ email, password: temporary })).error).toBeNull();
    const auth = new SupabaseAuthGateway(db);
    expect(await auth.currentUser()).toEqual({ userId: made.value.userId, email, mustChangePassword: true });

    const change = makeChangeOwnPassword({ auth, passwords: new SupabasePasswordGateway(db, createPublicClient), accounts });

    // A wrong current password changes nothing and leaves the session alone.
    expect(await change({ current: "not-the-password", next: "my own new password" })).toEqual({ ok: false, error: { type: "WRONG_PASSWORD" } });
    expect((await auth.currentUser())?.mustChangePassword).toBe(true);
    expect(await canSignIn(temporary)).toBe(true);

    // The real change: still signed in, no longer marked temporary (the session knows at once).
    expect(await change({ current: temporary, next: "my own new password" })).toEqual({ ok: true, value: undefined });
    expect(await auth.currentUser()).toEqual({ userId: made.value.userId, email, mustChangePassword: false });
    expect(await canSignIn(temporary)).toBe(false);
    expect(await canSignIn("my own new password")).toBe(true);

    // A fresh sign-in is not marked either, and a second change works like the first (without the mark to clear).
    const again = createPublicClient();
    await again.auth.signInWithPassword({ email, password: "my own new password" });
    const authAgain = new SupabaseAuthGateway(again);
    expect((await authAgain.currentUser())?.mustChangePassword).toBe(false);
    const changeAgain = makeChangeOwnPassword({ auth: authAgain, passwords: new SupabasePasswordGateway(again, createPublicClient), accounts });
    expect((await changeAgain({ current: "my own new password", next: "another password 2" })).ok).toBe(true);
    expect(await canSignIn("another password 2")).toBe(true);
  });

  it("the seeded demo accounts are not marked as having a temporary password", async () => {
    const db = createPublicClient();
    await db.auth.signInWithPassword({ email: "waiter@demo-dinein.test", password: DEMO_PASSWORD });
    const user = await new SupabaseAuthGateway(db).currentUser();
    expect(user?.email).toBe("waiter@demo-dinein.test");
    expect(user?.mustChangePassword).toBe(false);
  });
});
