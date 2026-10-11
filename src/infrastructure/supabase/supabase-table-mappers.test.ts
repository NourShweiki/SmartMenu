import { describe, expect, it } from "vitest";
import { newTableToken } from "../random-token";
import { toPublicOrders, toPublicSession } from "./supabase-table-session-gateway";
import { toTable, type TableRow } from "./supabase-table-repository";
import { toSessionAtTable, type SessionAtTableRow } from "./supabase-table-session-repository";
import { TOKEN_PATTERN } from "@/domain/table-session/table-session";

const row: TableRow = {
  id: "aaaaaaaa-7c7c-4000-8000-000000000001",
  restaurant_id: "11111111-1111-4000-8000-000000000001",
  label: "Terrace 2",
  token: "grill-terrace-demo-token-0003",
  is_active: true,
  created_at: "2026-10-10T12:00:00.000Z",
  deleted_at: null,
};

describe("toTable", () => {
  it("maps the columns to the domain shape", () => {
    expect(toTable(row)).toEqual({
      id: row.id,
      restaurantId: row.restaurant_id,
      label: "Terrace 2",
      token: row.token,
      isActive: true,
      createdAt: new Date("2026-10-10T12:00:00.000Z"),
      deletedAt: null,
    });
    expect(toTable({ ...row, is_active: false, deleted_at: "2026-10-11T08:00:00.000Z" })).toMatchObject({
      isActive: false,
      deletedAt: new Date("2026-10-11T08:00:00.000Z"),
    });
  });
});

describe("toPublicSession", () => {
  it("reads what the join function returns", () => {
    expect(toPublicSession({ session_id: "s-1", table_label: "7", status: "OPEN" })).toEqual({ sessionId: "s-1", kind: "TABLE", tableLabel: "7", status: "OPEN" });
    // What the lookup returns since takeout: the kind, and for a pickup visit the name instead of a table.
    expect(toPublicSession({ session_id: "s-1", kind: "TABLE", table_label: "7", customer_name: null, status: "OPEN" })).toEqual({ sessionId: "s-1", kind: "TABLE", tableLabel: "7", status: "OPEN" });
    expect(toPublicSession({ session_id: "s-3", kind: "PICKUP", table_label: null, customer_name: "Ali Hasan", status: "OPEN" })).toEqual({
      sessionId: "s-3",
      kind: "PICKUP",
      customerName: "Ali Hasan",
      status: "OPEN",
    });
    expect(toPublicSession({ session_id: "s-2", table_label: "Terrace", status: "PAYMENT_REQUESTED" })?.status).toBe("PAYMENT_REQUESTED");
  });

  it("returns null for anything unexpected instead of throwing", () => {
    for (const odd of [null, undefined, "x", 5, [], {}, { session_id: "", table_label: "7", status: "OPEN" }, { session_id: "s", table_label: 7, status: "OPEN" }, { session_id: "s", table_label: "7", status: "WHATEVER" }, { session_id: "s", kind: "PICKUP", table_label: null, customer_name: null, status: "OPEN" }, { session_id: "s", kind: "TABLE", table_label: null, customer_name: "Ali", status: "OPEN" }]) {
      expect(toPublicSession(odd)).toBeNull();
    }
  });
});

describe("newTableToken", () => {
  it("is URL-safe, long enough for the domain rule, and never repeats", () => {
    const tokens = Array.from({ length: 200 }, newTableToken);
    for (const token of tokens) expect(token).toMatch(TOKEN_PATTERN);
    expect(new Set(tokens).size).toBe(200);
    expect(tokens[0]!.length).toBeGreaterThanOrEqual(22);
  });
});

describe("toSessionAtTable", () => {
  const sessionRow: SessionAtTableRow = {
    id: "bbbbbbbb-7c7c-4000-8000-000000000001",
    restaurant_id: "11111111-1111-4000-8000-000000000001",
    table_id: row.id,
    kind: "TABLE",
    customer_name: null,
    customer_phone: null,
    status: "PAYMENT_REQUESTED",
    started_at: "2026-10-10T18:00:00.000Z",
    ended_at: null,
    restaurant_tables: { label: "Terrace 2" },
  };

  it("maps a visit and the label of its table", () => {
    expect(toSessionAtTable(sessionRow)).toEqual({
      tableLabel: "Terrace 2",
      session: {
        id: sessionRow.id,
        restaurantId: sessionRow.restaurant_id,
        kind: "TABLE",
        tableId: row.id,
        customer: null,
        status: "PAYMENT_REQUESTED",
        startedAt: new Date("2026-10-10T18:00:00.000Z"),
        endedAt: null,
      },
    });
    // A pickup visit: no table, the customer instead.
    expect(toSessionAtTable({ ...sessionRow, table_id: null, kind: "PICKUP", customer_name: "Ali Hasan", customer_phone: "+962791234567", restaurant_tables: null })).toMatchObject({
      tableLabel: null,
      session: { kind: "PICKUP", tableId: null, customer: { name: "Ali Hasan", phone: "+962791234567" } },
    });
    // Rows that are neither: a table visit without its table, a pickup visit without its customer.
    expect(toSessionAtTable({ ...sessionRow, restaurant_tables: null })).toBeNull();
    expect(toSessionAtTable({ ...sessionRow, table_id: null, kind: "PICKUP", customer_name: null, customer_phone: null, restaurant_tables: null })).toBeNull();
    expect(toSessionAtTable({ ...sessionRow, status: "CLOSED", ended_at: "2026-10-10T19:30:00.000Z" })?.session).toMatchObject({
      status: "CLOSED",
      endedAt: new Date("2026-10-10T19:30:00.000Z"),
    });
  });

  it("gives nothing for a visit that came without its table", () => {
    expect(toSessionAtTable({ ...sessionRow, restaurant_tables: null })).toBeNull();
  });
});

describe("toPublicOrders", () => {
  const entry = {
    number: 12,
    status: "READY",
    placed_at: "2026-10-11T18:00:00+00:00",
    total_fils: 13079,
    items: [
      { name_en: "Kebab", name_ar: "كباب", quantity: 2 },
      { name_en: "Hummus", name_ar: "حمص", quantity: 1 },
    ],
  };

  it("maps what the public function returns", () => {
    expect(toPublicOrders([entry, { ...entry, number: 13, status: "CANCELLED", items: [] }])).toEqual([
      {
        number: 12,
        status: "READY",
        placedAt: new Date("2026-10-11T18:00:00Z"),
        totalFils: 13079,
        lines: [
          { name: { en: "Kebab", ar: "كباب" }, quantity: 2 },
          { name: { en: "Hummus", ar: "حمص" }, quantity: 1 },
        ],
      },
      { number: 13, status: "CANCELLED", placedAt: new Date("2026-10-11T18:00:00Z"), totalFils: 13079, lines: [] },
    ]);
  });

  it("never throws on anything unexpected: no list is no orders, a broken entry or line is left out", () => {
    for (const nothing of [null, undefined, "x", {}, 7]) expect(toPublicOrders(nothing)).toEqual([]);
    const odd = [null, "x", { ...entry, number: "12" }, { ...entry, status: "EATEN" }, { ...entry, placed_at: "never" }, { ...entry, total_fils: null }];
    expect(toPublicOrders(odd)).toEqual([]);
    expect(toPublicOrders([{ ...entry, items: [{ name_en: "Kebab" }, null, entry.items[1]] }])[0]?.lines).toEqual([{ name: { en: "Hummus", ar: "حمص" }, quantity: 1 }]);
    expect(toPublicOrders([{ ...entry, items: "x" }])[0]?.lines).toEqual([]);
  });
});
