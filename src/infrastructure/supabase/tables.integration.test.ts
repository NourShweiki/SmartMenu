// Tables and table sessions against the LOCAL Supabase: real adapters, real database rules.
// Staff side (signed in): add / rename / clash / new QR token / deactivate / delete. Customer side (anonymous): scan.
// Run: `npm run test:integration` (loads .env.local). Skipped in `npm test` and CI.
// Everything it creates is labelled "IT-T-..." and swept (sessions, then tables) before and after the run, so a run that
// was killed halfway heals on the next one. Scanning a seeded demo table starts a live session; the sweep removes it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { createTable, type TableId } from "@/domain/table-session/table-session";
import { createPublicClient, createServiceClient } from "./client";
import { newTableToken } from "../random-token";
import { SupabaseTableRepository } from "./supabase-table-repository";
import { SupabaseTableSessionGateway } from "./supabase-table-session-gateway";
import { SupabaseTableSessionRepository } from "./supabase-table-session-repository";
import { makeMoveTableSession } from "@/application/use-cases/tables/move-table-session";
import type { TableSessionId } from "@/domain/table-session/table-session";

const GRILL = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const COFFEE = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const PASSWORD = "smartmenu-demo-2026"; // supabase/seed.sql
const enabled = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function clientFor(email: string) {
  const db = createPublicClient();
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return db;
}
const repoFor = async (email: string) => new SupabaseTableRepository(await clientFor(email));
/** The staff side of table sessions, as this signed-in person. */
const sessionsFor = async (email: string) => new SupabaseTableSessionRepository(await clientFor(email));
const deps = { newId: () => crypto.randomUUID(), newToken: newTableToken };
const NOW = new Date();
const SEEDED_TOKEN = "grill-table-1-demo-token-0001"; // supabase/seed.sql

describe.skipIf(!enabled)("tables and sessions against local Supabase", () => {
  const service = enabled ? createServiceClient() : (undefined as never);

  async function sweep() {
    const { data } = await service.from("restaurant_tables").select("id").ilike("label", "IT-T-%");
    const ids = (data ?? []).map((t) => t.id as string);
    // Scanning a seeded demo table starts a live session: remove it, so the demo data is left as it was found.
    const { data: seeded } = await service.from("restaurant_tables").select("id").eq("token", SEEDED_TOKEN);
    const sessionTables = [...ids, ...(seeded ?? []).map((t) => t.id as string)];
    if (sessionTables.length > 0) await service.from("table_sessions").delete().in("table_id", sessionTables);
    if (ids.length > 0) await service.from("restaurant_tables").delete().in("id", ids);
  }
  beforeAll(sweep);
  afterAll(sweep);

  it("lets the owner add, rename, refuse a clashing label, and soft-delete (freeing the label)", async () => {
    const owner = await repoFor("owner@demo-dinein.test");
    const first = createTable(GRILL, "IT-T-A", deps, NOW);
    const second = createTable(GRILL, "IT-T-B", deps, new Date(NOW.getTime() + 1000)); // later, so the list order is certain
    if (!first.ok || !second.ok) throw new Error("fixtures");

    expect(await owner.insert(first.value)).toBe("OK");
    expect(await owner.insert(second.value)).toBe("OK");
    expect((await owner.list(GRILL)).filter((t) => t.label.startsWith("IT-T-")).map((t) => t.label)).toEqual(["IT-T-A", "IT-T-B"]);
    expect(await owner.find(GRILL, first.value.id)).toEqual(first.value); // round trip, dates included

    // The same label ignoring case and spacing is refused, for a new table and for a rename.
    const dup = createTable(GRILL, "it-t-a", deps, NOW);
    if (!dup.ok) throw new Error("fixture");
    expect(await owner.insert(dup.value)).toBe("LABEL_TAKEN");
    expect(await owner.update({ ...second.value, label: "IT-T-a" })).toBe("LABEL_TAKEN");
    expect(await owner.update({ ...first.value, label: "IT-T-A2" })).toBe("OK");
    expect((await owner.find(GRILL, first.value.id))?.label).toBe("IT-T-A2");

    // Soft delete: gone from the list, label free again.
    expect(await owner.update({ ...first.value, label: "IT-T-A2", deletedAt: NOW })).toBe("OK");
    expect((await owner.list(GRILL)).map((t) => t.id)).not.toContain(first.value.id);
    const reuse = createTable(GRILL, "IT-T-A2", deps, NOW);
    if (!reuse.ok) throw new Error("fixture");
    expect(await owner.insert(reuse.value)).toBe("OK");
  });

  it("refuses a waiter's change and another restaurant's table, as the database does", async () => {
    const owner = await repoFor("owner@demo-dinein.test");
    const table = createTable(GRILL, "IT-T-C", deps, NOW);
    if (!table.ok) throw new Error("fixture");
    await owner.insert(table.value);

    const waiter = await repoFor("waiter@demo-dinein.test");
    expect((await waiter.list(GRILL)).map((t) => t.label)).toContain("IT-T-C"); // staff can read...
    const other = createTable(GRILL, "IT-T-D", deps, NOW);
    if (!other.ok) throw new Error("fixture");
    await expect(waiter.insert(other.value)).rejects.toThrow(); // ...but not add
    expect(await waiter.update({ ...table.value, label: "IT-T-Hacked" })).toBe("NOT_FOUND"); // ...or change

    const coffeeOwner = await repoFor("owner@demo-takeout.test");
    expect(await coffeeOwner.find(GRILL, table.value.id)).toBeNull(); // not their restaurant
    expect(await coffeeOwner.update({ ...table.value, label: "IT-T-Hacked" })).toBe("NOT_FOUND");
    expect((await owner.find(GRILL, table.value.id))?.label).toBe("IT-T-C");
  });

  it("scanning joins the table's live session; a new token, deactivation or dine-in off stop the old code", async () => {
    const owner = await repoFor("owner@demo-dinein.test");
    const gateway = new SupabaseTableSessionGateway(createPublicClient()); // anonymous
    const made = createTable(GRILL, "IT-T-Scan", deps, NOW);
    if (!made.ok) throw new Error("fixture");
    const table = made.value;
    await owner.insert(table);

    const a = await gateway.join("demo-dinein", table.token);
    expect(a).toMatchObject({ tableLabel: "IT-T-Scan", status: "OPEN" });
    const b = await gateway.join("demo-dinein", table.token); // a second phone at the same table
    expect(b?.sessionId).toBe(a?.sessionId);
    expect((await gateway.find("demo-dinein", a!.sessionId))?.sessionId).toBe(a!.sessionId);
    expect(await gateway.find("demo-takeout", a!.sessionId)).toBeNull(); // another restaurant's address
    expect(await gateway.join("demo-takeout", table.token)).toBeNull(); // a token only works at its own restaurant

    // A new QR token: the printed one stops working at once, the new one joins the SAME live session.
    const fresh = { ...table, token: newTableToken() };
    expect(await owner.update(fresh)).toBe("OK");
    expect(await gateway.join("demo-dinein", table.token)).toBeNull();
    expect((await gateway.join("demo-dinein", fresh.token))?.sessionId).toBe(a!.sessionId);

    // Inactive table: not scannable. Active again: back to the same session.
    expect(await owner.update({ ...fresh, isActive: false })).toBe("OK");
    expect(await gateway.join("demo-dinein", fresh.token)).toBeNull();
    expect(await owner.update({ ...fresh, isActive: true })).toBe("OK");
    expect((await gateway.join("demo-dinein", fresh.token))?.sessionId).toBe(a!.sessionId);
  });

  it("staff read a visit with its table's label (also after the table is deleted); other restaurants and visitors get nothing", async () => {
    const owner = await repoFor("owner@demo-dinein.test");
    const made = createTable(GRILL, "IT-T-Staff", deps, NOW);
    if (!made.ok) throw new Error("fixture");
    const table = made.value;
    await owner.insert(table);
    const visit = await new SupabaseTableSessionGateway(createPublicClient()).join("demo-dinein", table.token); // a guest scans
    const id = visit!.sessionId;

    // Every role reads it (the cashier bills by table); unknown ids and junk are simply not there.
    for (const email of ["waiter@demo-dinein.test", "cashier@demo-dinein.test", "owner@demo-dinein.test"]) {
      const found = await (await sessionsFor(email)).findWithTables(GRILL, [id, id, crypto.randomUUID() as TableSessionId, "junk" as TableSessionId]);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ tableLabel: "IT-T-Staff", session: { id, restaurantId: GRILL, tableId: table.id, status: "OPEN", endedAt: null } });
      expect(found[0]!.session.startedAt).toBeInstanceOf(Date);
    }
    const waiter = await sessionsFor("waiter@demo-dinein.test");
    expect(await waiter.findWithTables(GRILL, [])).toEqual([]);

    // Renamed: the current label. Deleted (soft): the label is still there, an old order keeps its table.
    expect(await owner.update({ ...table, label: "IT-T-Staff 2" })).toBe("OK");
    expect((await waiter.findWithTables(GRILL, [id]))[0]?.tableLabel).toBe("IT-T-Staff 2");
    expect(await owner.update({ ...table, label: "IT-T-Staff 2", deletedAt: NOW })).toBe("OK");
    expect((await waiter.findWithTables(GRILL, [id]))[0]?.tableLabel).toBe("IT-T-Staff 2");

    // Demo Coffee's owner: nothing, whichever restaurant they name.
    const coffee = await sessionsFor("owner@demo-takeout.test");
    expect(await coffee.findWithTables(GRILL, [id])).toEqual([]);
    expect(await coffee.findWithTables(COFFEE, [id])).toEqual([]);
    // A visitor who is not signed in has no access to the table at all: the database refuses outright.
    await expect(new SupabaseTableSessionRepository(createPublicClient()).findWithTables(GRILL, [id])).rejects.toThrow(/permission denied/);
    // Naming the wrong restaurant finds nothing even for its own staff.
    expect(await waiter.findWithTables(COFFEE, [id])).toEqual([]);
  });

  it("moves a visit by role: waiter 'ready to pay', cashier closes; the database refuses everything else", async () => {
    const owner = await repoFor("owner@demo-dinein.test");
    const made = createTable(GRILL, "IT-T-Move", deps, NOW);
    if (!made.ok) throw new Error("fixture");
    await owner.insert(made.value);
    const gateway = new SupabaseTableSessionGateway(createPublicClient());
    const id = (await gateway.join("demo-dinein", made.value.token))!.sessionId;

    const clock = { now: () => new Date() };
    const waiterRepo = await sessionsFor("waiter@demo-dinein.test");
    const cashierRepo = await sessionsFor("cashier@demo-dinein.test");
    const noOrders = { listBySession: async () => [] }; // this visit never ordered (orders are covered in orders.integration)
    const asWaiter = makeMoveTableSession({ sessions: waiterRepo, orders: noOrders, clock });
    const asCashier = makeMoveTableSession({ sessions: cashierRepo, orders: noOrders, clock });
    const waiter = { restaurantId: GRILL, role: "WAITER" } as const;
    const cashier = { restaurantId: GRILL, role: "CASHIER" } as const;

    // Wrong role for the move: refused by the use case, and by the DATABASE when the use case is bypassed.
    expect(await asCashier(cashier, { sessionId: id, to: "PAYMENT_REQUESTED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(await cashierRepo.updateStatus(GRILL, id, "OPEN", "PAYMENT_REQUESTED")).toBe(false);
    expect(await waiterRepo.updateStatus(GRILL, id, "OPEN", "CLOSED")).toBe(false);
    // Another restaurant's owner cannot touch it at all.
    const coffee = await sessionsFor("owner@demo-takeout.test");
    expect(await coffee.updateStatus(GRILL, id, "OPEN", "CLOSED")).toBe(false);
    expect(await makeMoveTableSession({ sessions: coffee, orders: noOrders, clock })({ restaurantId: COFFEE, role: "OWNER" }, { sessionId: id, to: "CLOSED" })).toEqual({
      ok: false,
      error: { type: "SESSION_NOT_FOUND" },
    });
    expect((await waiterRepo.findWithTables(GRILL, [id]))[0]?.session.status).toBe("OPEN"); // untouched so far
    // It is on the list of live visits (with its label) for Grill's staff, and not for Coffee's owner.
    expect((await waiterRepo.listLive(GRILL)).find((v) => v.session.id === id)).toMatchObject({ tableLabel: "IT-T-Move", session: { status: "OPEN" } });
    expect(await coffee.listLive(GRILL)).toEqual([]);
    expect((await coffee.listLive(COFFEE)).some((v) => v.session.id === id)).toBe(false);

    // The waiter signals "ready to pay". The guests' phones see it; a second identical move finds it already done.
    expect(await asWaiter(waiter, { sessionId: id, to: "PAYMENT_REQUESTED" })).toMatchObject({ ok: true, value: { tableLabel: "IT-T-Move", session: { status: "PAYMENT_REQUESTED" } } });
    expect((await gateway.find("demo-dinein", id))?.status).toBe("PAYMENT_REQUESTED");
    expect(await waiterRepo.updateStatus(GRILL, id, "OPEN", "PAYMENT_REQUESTED")).toBe(false); // stale "from"
    expect(await asWaiter(waiter, { sessionId: id, to: "CLOSED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });

    // The cashier closes it: the database stamps the end time, and nothing can follow.
    expect(await asCashier(cashier, { sessionId: id, to: "CLOSED" })).toMatchObject({ ok: true, value: { session: { status: "CLOSED" } } });
    const stored = (await cashierRepo.findWithTables(GRILL, [id]))[0]!.session;
    expect(stored.status).toBe("CLOSED");
    expect(stored.endedAt).toBeInstanceOf(Date);
    expect((await cashierRepo.listLive(GRILL)).some((v) => v.session.id === id)).toBe(false); // closed: off the live list
    expect(await cashierRepo.updateStatus(GRILL, id, "CLOSED", "PAYMENT_REQUESTED")).toBe(false);
    expect(await asCashier(cashier, { sessionId: id, to: "CLOSED" })).toEqual({ ok: false, error: { type: "INVALID_TRANSITION", from: "CLOSED", to: "CLOSED" } });

    // The table is free again: the next scan starts a new visit.
    const next = await gateway.join("demo-dinein", made.value.token);
    expect(next?.status).toBe("OPEN");
    expect(next?.sessionId).not.toBe(id);
  });

  it("knows the seeded demo tables: Demo Grill's scan works, Demo Coffee (dine-in off) refuses", async () => {
    const gateway = new SupabaseTableSessionGateway(createPublicClient());
    expect(await gateway.join("demo-takeout", "coffee-table-a-demo-token-0001")).toBeNull(); // takeout-only restaurant
    expect(await gateway.join("demo-dinein", SEEDED_TOKEN)).toMatchObject({ tableLabel: "1" });
    expect(await gateway.join("demo-dinein", "coffee-table-a-demo-token-0001")).toBeNull(); // wrong restaurant
    const owner = await repoFor("owner@demo-takeout.test");
    expect((await owner.list(COFFEE)).map((t) => t.label)).toContain("A");
    expect(await owner.find(COFFEE, "00000000-0000-4000-8000-000000000000" as TableId)).toBeNull();
  });
});
