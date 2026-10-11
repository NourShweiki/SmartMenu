import { createClient } from "@supabase/supabase-js";

/**
 * Removes what earlier browser test runs left in the LOCAL database: the restaurants and owner accounts the setup-tool
 * tests made ("e2e-..."), and every table the tests made (they are all
 * labelled "E2E ...") with its visits and their orders. Runs before the suite (so a run that was killed heals on
 * the next one) and after it (so a run leaves the demo data as it found it).
 *
 * Why it matters: orders cannot be deleted from any screen and several older specs never close their visits, so
 * the leftovers used to pile up, and the staff screens (which refresh themselves every few seconds) redraw every
 * unfinished order and open visit each time. A hundred leftovers made the suite crawl and time out (2026-10-11).
 *
 * It works straight on the database with the service-role key from `.env.local`, like the integration tests. It
 * only ever touches rows that hang off an "E2E ..." table, takeout orders whose customer is called "E2E ...",
 * "e2e-..." restaurants and "e2e-...@test.local" accounts;
 * the seeded demo restaurants, accounts and tables and everything on them are left alone. Without the key it does nothing (the tests still run, the leftovers stay).
 */
export default async function removeTestLeftovers(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No such file: fall through to whatever is in the environment.
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: tables, error } = await db.from("restaurant_tables").select("id").like("label", "E2E %");
  if (error) throw new Error(`cleaning test leftovers: ${error.message}`);
  const tableIds = (tables ?? []).map((t) => t.id as string);

  // In small batches: the ids travel in the request address.
  for (let at = 0; at < tableIds.length; at += 40) {
    const batch = tableIds.slice(at, at + 40);
    const { data: sessions } = await db.from("table_sessions").select("id").in("table_id", batch);
    const sessionIds = (sessions ?? []).map((s) => s.id as string);
    for (let s = 0; s < sessionIds.length; s += 40) {
      await db.from("orders").delete().in("session_id", sessionIds.slice(s, s + 40)); // lines and options go with them
    }
    await db.from("table_sessions").delete().in("table_id", batch);
    await db.from("restaurant_tables").delete().in("id", batch);
  }

  // Takeout orders of the tests: pickup visits whose customer is called "E2E ..." (they hang off no table).
  const { data: pickups, error: pickupError } = await db.from("table_sessions").select("id").eq("kind", "PICKUP").like("customer_name", "E2E %");
  if (pickupError) throw new Error(`cleaning test pickup visits: ${pickupError.message}`);
  const pickupIds = (pickups ?? []).map((s) => s.id as string);
  for (let at = 0; at < pickupIds.length; at += 40) {
    const batch = pickupIds.slice(at, at + 40);
    await db.from("orders").delete().in("session_id", batch); // lines and options go with them
    await db.from("table_sessions").delete().in("id", batch);
  }

  // Restaurants the setup-tool tests created (address "e2e-...") with everything that hangs off them, and the owner
  // accounts made for them ("e2e-...@test.local"). No screen deletes a restaurant, so this is the only way out.
  const { error: restaurantError } = await db.from("restaurants").delete().like("slug", "e2e-%");
  if (restaurantError) throw new Error(`cleaning test restaurants: ${restaurantError.message}`);
  const { data: accounts, error: accountError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (accountError) throw new Error(`cleaning test accounts: ${accountError.message}`);
  for (const user of accounts.users) {
    if (user.email?.startsWith("e2e-") && user.email.endsWith("@test.local")) await db.auth.admin.deleteUser(user.id);
  }
}
