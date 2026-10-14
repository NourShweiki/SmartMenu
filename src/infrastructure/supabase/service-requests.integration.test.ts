// Service requests against the LOCAL Supabase: real adapters, real database rules.
// Guest side (anonymous): scan a table, ask for the waiter / cleaning / the bill. Staff side (signed in): the waiter lists and
// resolves, the cashier sees nothing, another restaurant sees nothing.
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// Scanning a seeded demo table starts a live visit; the sweep removes its requests and the visit before and after the run,
// so a run that was killed halfway heals on the next one and the demo data is left as it was found.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { ServiceRequestId } from "@/domain/service-request/service-request";
import { createPublicClient, createServiceClient } from "./client";
import { SupabaseServiceRequestGateway } from "./supabase-service-request-gateway";
import { SupabaseServiceRequestRepository } from "./supabase-service-request-repository";
import { SupabaseTableSessionGateway } from "./supabase-table-session-gateway";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
const SEEDED_TOKEN = "grill-table-1-demo-token-0001"; // supabase/seed.sql: Grill, table "1"
const enabled = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function staff(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return new SupabaseServiceRequestRepository(db);
}

describe.skipIf(!enabled)("service requests against local Supabase", () => {
  const service = enabled ? createServiceClient() : (undefined as never);

  async function sweep() {
    const { data: table } = await service.from("restaurant_tables").select("id").eq("token", SEEDED_TOKEN).single();
    if (!table) return;
    const { data: sessions } = await service.from("table_sessions").select("id").eq("table_id", table.id);
    const ids = (sessions ?? []).map((s) => s.id as string);
    if (ids.length > 0) {
      await service.from("service_requests").delete().in("session_id", ids);
      await service.from("table_sessions").delete().in("id", ids);
    }
  }
  beforeAll(sweep);
  afterAll(sweep);

  it("a guest asks, the waiter sees it with the table and resolves it; the cashier and another restaurant see nothing", async () => {
    const guests = new SupabaseTableSessionGateway(createPublicClient());
    const requests = new SupabaseServiceRequestGateway(createPublicClient());
    const session = await guests.join("demo-dinein", SEEDED_TOKEN);
    if (!session) throw new Error("fixture: the seeded table did not open a visit");

    // The guest's side.
    const made = await requests.create("demo-dinein", session.sessionId, "CALL_WAITER");
    expect(made).toMatchObject({ ok: true, value: { kind: "CALL_WAITER" } });
    expect(await requests.create("demo-dinein", session.sessionId, "CALL_WAITER")).toEqual({ ok: false, error: { type: "ALREADY_REQUESTED" } });
    expect(await requests.create("demo-dinein", session.sessionId, "ORDER_FOOD")).toEqual({ ok: false, error: { type: "INVALID_KIND" } });
    expect(await requests.create("demo-dinein", "not-a-uuid", "CALL_WAITER")).toEqual({ ok: false, error: { type: "SESSION_NOT_FOUND" } });
    expect(await requests.create("demo-takeout", session.sessionId, "CALL_WAITER")).toEqual({ ok: false, error: { type: "SESSION_NOT_FOUND" } }); // another restaurant's slug
    expect((await requests.forSession("demo-dinein", session.sessionId)).map((r) => [r.kind, r.status])).toEqual([["CALL_WAITER", "OPEN"]]);
    expect(await requests.forSession("demo-takeout", session.sessionId)).toEqual([]);
    expect(await requests.forSession("demo-dinein", "not-a-uuid")).toEqual([]);
    if (!made.ok) throw new Error("fixture");
    const id = made.value.id as ServiceRequestId;

    // The staff side: the waiter sees it with the table's label.
    const waiter = await staff("waiter@demo-dinein.test");
    const waiting = await waiter.listWaiting(GRILL, new Date());
    expect(waiting.find((w) => w.request.id === id)).toMatchObject({ tableLabel: "1", request: { kind: "CALL_WAITER", status: "OPEN", resolvedAt: null } });

    // The cashier does not see service requests; neither does another restaurant's owner.
    expect(await (await staff("cashier@demo-dinein.test")).listWaiting(GRILL, new Date())).toEqual([]);
    const coffeeOwner = await staff("owner@demo-takeout.test");
    expect(await coffeeOwner.listWaiting(GRILL, new Date())).toEqual([]);
    expect(await coffeeOwner.findById(GRILL, id)).toBeNull();
    expect(await coffeeOwner.markDone(COFFEE, id)).toBe(false);
    expect(await (await staff("cashier@demo-dinein.test")).markDone(GRILL, id)).toBe(false);

    // The waiter resolves it, once; the database stamps the time.
    expect(await waiter.markDone(GRILL, id)).toBe(true);
    expect(await waiter.markDone(GRILL, id)).toBe(false); // already done
    expect(await waiter.findById(GRILL, id)).toMatchObject({ status: "DONE", resolvedAt: expect.any(Date) });
    expect((await waiter.listWaiting(GRILL, new Date())).map((w) => w.request.id)).not.toContain(id);
    expect((await requests.forSession("demo-dinein", session.sessionId))[0]).toMatchObject({ kind: "CALL_WAITER", status: "DONE" });
    expect(await waiter.findById(GRILL, "not-a-uuid" as ServiceRequestId)).toBeNull();
    expect(await waiter.markDone(GRILL, "not-a-uuid" as ServiceRequestId)).toBe(false);
  });

  it("leaves a visit that ran out of its 2 hours out of the waiter's list, even though its request still says waiting", async () => {
    const guests = new SupabaseTableSessionGateway(createPublicClient());
    const requests = new SupabaseServiceRequestGateway(createPublicClient());
    const session = await guests.join("demo-dinein", SEEDED_TOKEN);
    if (!session) throw new Error("fixture");
    const made = await requests.create("demo-dinein", session.sessionId, "CLEAN_TABLE");
    if (!made.ok) throw new Error("fixture");
    const waiter = await staff("waiter@demo-dinein.test");
    expect((await waiter.listWaiting(GRILL, new Date())).map((w) => w.request.id)).toContain(made.value.id);

    // Three hours later the visit has expired (closed lazily: nothing updated the row).
    expect((await waiter.listWaiting(GRILL, new Date(Date.now() + 3 * 3_600_000))).map((w) => w.request.id)).not.toContain(made.value.id);
    // And a guest of an expired visit can no longer ask for anything.
    await service.from("table_sessions").update({ started_at: new Date(Date.now() - 3 * 3_600_000).toISOString() }).eq("id", session.sessionId);
    expect(await requests.create("demo-dinein", session.sessionId, "REQUEST_BILL")).toEqual({ ok: false, error: { type: "SESSION_ENDED" } });
  });
});
