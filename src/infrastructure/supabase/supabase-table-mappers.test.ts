import { describe, expect, it } from "vitest";
import { newTableToken } from "../random-token";
import { toPublicSession } from "./supabase-table-session-gateway";
import { toTable, type TableRow } from "./supabase-table-repository";
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
    expect(toPublicSession({ session_id: "s-1", table_label: "7", status: "OPEN" })).toEqual({ sessionId: "s-1", tableLabel: "7", status: "OPEN" });
    expect(toPublicSession({ session_id: "s-2", table_label: "Terrace", status: "PAYMENT_REQUESTED" })?.status).toBe("PAYMENT_REQUESTED");
  });

  it("returns null for anything unexpected instead of throwing", () => {
    for (const odd of [null, undefined, "x", 5, [], {}, { session_id: "", table_label: "7", status: "OPEN" }, { session_id: "s", table_label: 7, status: "OPEN" }, { session_id: "s", table_label: "7", status: "WHATEVER" }]) {
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
