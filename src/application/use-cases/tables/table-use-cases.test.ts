import { describe, expect, it } from "vitest";
import type { TableRepository } from "@/application/ports/table-repository";
import type { PublicSession, TableSessionGateway } from "@/application/ports/table-session-gateway";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { ROLES } from "@/domain/restaurant/role";
import { labelKey, type Table, type TableId, type TableSessionId } from "@/domain/table-session/table-session";
import { makeGetPublicSession, makeJoinTableSession } from "./join-table-session";
import {
  makeAddTable,
  makeDeleteTable,
  makeListTables,
  makeRegenerateTableToken,
  makeRenameTable,
  makeSetTableActive,
} from "./table-use-cases";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const OTHER = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const NOW = new Date("2026-10-10T12:00:00Z");
const owner = { restaurantId: R, role: "OWNER" } as const;
const manager = { restaurantId: R, role: "MANAGER" } as const;

let n = 0;
const ids = { newId: () => `id-${++n}` };
const tokens = { newToken: () => `fresh${String(++n).padStart(3, "0")}-abcdefghijklmnopqrst` };
const clock = { now: () => NOW };

function fakeTables(initial: Table[] = []) {
  const state = { tables: [...initial], writes: 0, refuse: false };
  const repo: TableRepository = {
    list: async (restaurantId) => state.tables.filter((t) => t.restaurantId === restaurantId && !t.deletedAt),
    find: async (restaurantId, id) => state.tables.find((t) => t.restaurantId === restaurantId && t.id === id) ?? null,
    insert: async (table) => {
      state.writes++;
      if (state.tables.some((t) => t.restaurantId === table.restaurantId && !t.deletedAt && labelKey(t.label) === labelKey(table.label))) return "LABEL_TAKEN";
      state.tables.push(table);
      return "OK";
    },
    update: async (table) => {
      state.writes++;
      if (state.refuse) return "NOT_FOUND";
      const clash = state.tables.some((t) => t.id !== table.id && t.restaurantId === table.restaurantId && !t.deletedAt && !table.deletedAt && labelKey(t.label) === labelKey(table.label));
      if (clash) return "LABEL_TAKEN";
      const index = state.tables.findIndex((t) => t.id === table.id);
      if (index < 0) return "NOT_FOUND";
      state.tables[index] = table;
      return "OK";
    },
  };
  return { repo, state };
}
const deps = (tables: TableRepository) => ({ tables, ids, tokens, clock });
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe("add / list tables", () => {
  it("adds a table with a fresh random token and lists it", async () => {
    const { repo, state } = fakeTables();
    const table = unwrap(await makeAddTable(deps(repo))(owner, { label: "  Terrace   2 " }));
    expect(table).toMatchObject({ restaurantId: R, label: "Terrace 2", isActive: true, createdAt: NOW });
    expect(table.token).toMatch(/^fresh/);
    expect(state.tables).toEqual([table]);
    expect(unwrap(await makeListTables({ tables: repo })(manager))).toEqual([table]);
  });

  it("refuses a label that clashes ignoring case, and invalid labels, without storing anything", async () => {
    const { repo, state } = fakeTables();
    const add = makeAddTable(deps(repo));
    unwrap(await add(owner, { label: "Terrace" }));
    expect(await add(owner, { label: "  terrace " })).toEqual({ ok: false, error: { type: "LABEL_TAKEN" } });
    expect(await add(owner, { label: "" })).toEqual({ ok: false, error: { type: "LABEL_REQUIRED" } });
    expect(await add(owner, { label: "x".repeat(21) })).toMatchObject({ ok: false, error: { type: "LABEL_TOO_LONG" } });
    expect(state.tables).toHaveLength(1);
  });

  it("is for owner and manager only (waiter and cashier are refused, nothing is written)", async () => {
    const { repo, state } = fakeTables();
    for (const role of ROLES.filter((r) => r !== "OWNER" && r !== "MANAGER")) {
      const actor = { restaurantId: R, role };
      expect(await makeAddTable(deps(repo))(actor, { label: "7" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
      expect(await makeListTables({ tables: repo })(actor)).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    }
    expect(state.writes).toBe(0);
  });

  it("lists only the actor's own restaurant", async () => {
    const { repo } = fakeTables();
    unwrap(await makeAddTable(deps(repo))(owner, { label: "1" }));
    unwrap(await makeAddTable(deps(repo))({ restaurantId: OTHER, role: "OWNER" }, { label: "1" })); // same label, other restaurant: fine
    expect(unwrap(await makeListTables({ tables: repo })(owner)).map((t) => t.restaurantId)).toEqual([R]);
  });
});

describe("change a table", () => {
  const setup = async () => {
    const { repo, state } = fakeTables();
    const table = unwrap(await makeAddTable(deps(repo))(owner, { label: "7" }));
    const other = unwrap(await makeAddTable(deps(repo))(owner, { label: "8" }));
    return { repo, state, table, other };
  };

  it("renames (the QR token stays), and refuses a label another table has", async () => {
    const { repo, table, other } = await setup();
    const renamed = unwrap(await makeRenameTable({ tables: repo })(manager, { tableId: table.id, label: "Window" }));
    expect(renamed).toMatchObject({ label: "Window", token: table.token });
    expect(await makeRenameTable({ tables: repo })(owner, { tableId: table.id, label: " 8 " })).toEqual({ ok: false, error: { type: "LABEL_TAKEN" } });
    expect(other.label).toBe("8");
  });

  it("deactivates and reactivates", async () => {
    const { repo, table } = await setup();
    expect(unwrap(await makeSetTableActive({ tables: repo })(owner, { tableId: table.id, isActive: false })).isActive).toBe(false);
    expect(unwrap(await makeSetTableActive({ tables: repo })(owner, { tableId: table.id, isActive: true })).isActive).toBe(true);
  });

  it("regenerating gives a different token and keeps the rest", async () => {
    const { repo, table } = await setup();
    const fresh = unwrap(await makeRegenerateTableToken({ tables: repo, tokens })(owner, { tableId: table.id }));
    expect(fresh.token).not.toBe(table.token);
    expect(fresh).toMatchObject({ id: table.id, label: "7" });
  });

  it("deleting hides it from the list and frees the label for a new table", async () => {
    const { repo, table } = await setup();
    const gone = unwrap(await makeDeleteTable({ tables: repo, clock })(owner, { tableId: table.id }));
    expect(gone.deletedAt).toEqual(NOW);
    expect((await repo.list(R)).map((t) => t.label)).toEqual(["8"]);
    expect(unwrap(await makeAddTable(deps(repo))(owner, { label: "7" })).label).toBe("7");
    // A deleted table can no longer be found or changed.
    expect(await makeRenameTable({ tables: repo })(owner, { tableId: table.id, label: "x" })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
  });

  it("refuses other roles and other restaurants' tables, and never reports a change the database refused", async () => {
    const { repo, state, table } = await setup();
    const before = state.writes;
    for (const role of ["WAITER", "CASHIER"] as const) {
      expect(await makeRenameTable({ tables: repo })({ restaurantId: R, role }, { tableId: table.id, label: "x" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    }
    expect(await makeRenameTable({ tables: repo })({ restaurantId: OTHER, role: "OWNER" }, { tableId: table.id, label: "x" })).toEqual({
      ok: false,
      error: { type: "NOT_FOUND" },
    });
    expect(await makeRenameTable({ tables: repo })(owner, { tableId: "nope" as TableId, label: "x" })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
    expect(state.writes).toBe(before);

    state.refuse = true; // the database says no
    expect(await makeRenameTable({ tables: repo })(owner, { tableId: table.id, label: "Window" })).toEqual({ ok: false, error: { type: "NOT_FOUND" } });
  });
});

describe("scanning a QR code", () => {
  const session: PublicSession = { sessionId: "s-1" as TableSessionId, tableLabel: "7", status: "OPEN" };
  const gateway = () => {
    const calls: string[] = [];
    const sessions: TableSessionGateway = {
      join: async (slug, token) => (calls.push(`join ${slug} ${token}`), token.startsWith("good") ? session : null),
      find: async (slug, id) => (calls.push(`find ${slug} ${id}`), id === "11111111-1111-4000-8000-000000000009" ? session : null),
    };
    return { sessions, calls };
  };
  const goodToken = "good0000000000000000000000";

  it("joins with a plausible token and returns what the gateway says", async () => {
    const { sessions, calls } = gateway();
    expect(await makeJoinTableSession({ sessions })({ slug: "demo", token: goodToken })).toEqual(session);
    expect(calls).toEqual([`join demo ${goodToken}`]);
  });

  it("refuses a token that cannot be valid without asking the database", async () => {
    const { sessions, calls } = gateway();
    for (const token of ["", "short", "has spaces in it 1234567890", "x".repeat(65), "bad/slash-0123456789012345", "<script>alert(1)</script>"]) {
      expect(await makeJoinTableSession({ sessions })({ slug: "demo", token }), token).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it("returns null for a code the database does not know", async () => {
    const { sessions } = gateway();
    expect(await makeJoinTableSession({ sessions })({ slug: "demo", token: "nope000000000000000000000" })).toBeNull();
  });

  it("checks a held session id, refusing junk ids without a lookup", async () => {
    const { sessions, calls } = gateway();
    const get = makeGetPublicSession({ sessions });
    expect(await get({ slug: "demo", sessionId: "11111111-1111-4000-8000-000000000009" })).toEqual(session);
    expect(await get({ slug: "demo", sessionId: "not-a-uuid" })).toBeNull();
    expect(calls).toEqual(["find demo 11111111-1111-4000-8000-000000000009"]);
  });
});
