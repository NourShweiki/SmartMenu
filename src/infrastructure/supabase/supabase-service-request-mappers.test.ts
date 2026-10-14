import { describe, expect, it } from "vitest";
import { toCreateOutcome, toPublicServiceRequests } from "./supabase-service-request-gateway";
import { toServiceRequest, toWaitingRequest, type ServiceRequestRow } from "./supabase-service-request-repository";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const row: ServiceRequestRow = {
  id: "aaaaaaaa-5c5c-4000-8000-000000000001",
  restaurant_id: "11111111-1111-4000-8000-000000000001",
  session_id: "aaaaaaaa-5d5d-4000-8000-000000000001",
  table_id: "aaaaaaaa-5f5f-4000-8000-000000000001",
  kind: "CALL_WAITER",
  status: "OPEN",
  created_at: "2026-10-14T11:50:00.000Z",
  resolved_at: null,
  restaurant_tables: { label: "7" },
  table_sessions: { status: "OPEN", started_at: "2026-10-14T11:00:00.000Z" },
};

describe("toServiceRequest", () => {
  it("maps the columns to the domain shape", () => {
    expect(toServiceRequest(row)).toEqual({
      id: row.id,
      restaurantId: row.restaurant_id,
      sessionId: row.session_id,
      tableId: row.table_id,
      kind: "CALL_WAITER",
      status: "OPEN",
      createdAt: new Date("2026-10-14T11:50:00.000Z"),
      resolvedAt: null,
    });
    expect(toServiceRequest({ ...row, status: "DONE", resolved_at: "2026-10-14T11:55:00.000Z" })).toMatchObject({ status: "DONE", resolvedAt: new Date("2026-10-14T11:55:00.000Z") });
  });

  it("is nothing for a row it does not understand", () => {
    expect(toServiceRequest({ ...row, kind: "ORDER_FOOD" })).toBeNull();
    expect(toServiceRequest({ ...row, status: "PENDING" })).toBeNull();
    expect(toServiceRequest({ ...row, created_at: "yesterday-ish" })).toBeNull();
    expect(toServiceRequest({ ...row, resolved_at: "never" })).toBeNull();
  });
});

describe("toWaitingRequest", () => {
  it("shows a waiting request with its table's label", () => {
    expect(toWaitingRequest(row, NOW)).toMatchObject({ tableLabel: "7", request: { id: row.id, kind: "CALL_WAITER" } });
    expect(toWaitingRequest({ ...row, table_sessions: { status: "PAYMENT_REQUESTED", started_at: row.table_sessions!.started_at } }, NOW)).not.toBeNull(); // ready to pay: still a live visit
  });

  it("leaves out what nobody is waiting for: a done request, a closed visit, a visit past its 2 hours", () => {
    expect(toWaitingRequest({ ...row, status: "DONE", resolved_at: "2026-10-14T11:55:00.000Z" }, NOW)).toBeNull();
    expect(toWaitingRequest({ ...row, table_sessions: { status: "CLOSED", started_at: row.table_sessions!.started_at } }, NOW)).toBeNull();
    // Still stored as OPEN, but started 2 hours ago: the visit has run out of time (closed lazily).
    expect(toWaitingRequest({ ...row, table_sessions: { status: "OPEN", started_at: "2026-10-14T10:00:00.000Z" } }, NOW)).toBeNull();
    expect(toWaitingRequest({ ...row, table_sessions: { status: "OPEN", started_at: "2026-10-14T10:00:01.000Z" } }, NOW)).not.toBeNull();
  });

  it("leaves out a row whose table or visit did not come with it, or is not understood", () => {
    expect(toWaitingRequest({ ...row, restaurant_tables: null }, NOW)).toBeNull();
    expect(toWaitingRequest({ ...row, table_sessions: null }, NOW)).toBeNull();
    expect(toWaitingRequest({ ...row, table_sessions: { status: "WEIRD", started_at: row.table_sessions!.started_at } }, NOW)).toBeNull();
    expect(toWaitingRequest({ ...row, table_sessions: { status: "OPEN", started_at: "soon" } }, NOW)).toBeNull();
  });
});

describe("toCreateOutcome", () => {
  it("reads what the public function returns", () => {
    expect(toCreateOutcome({ ok: true, id: "r-1", kind: "CLEAN_TABLE" })).toEqual({ ok: true, value: { id: "r-1", kind: "CLEAN_TABLE" } });
    for (const error of ["INVALID_KIND", "NOT_A_TABLE_VISIT", "SESSION_ENDED", "ALREADY_REQUESTED"]) {
      expect(toCreateOutcome({ ok: false, error })).toEqual({ ok: false, error: { type: error } });
    }
  });

  it("treats NULL (a visit that is not this restaurant's) and anything unexpected as 'visit not found', never as a request that was made", () => {
    for (const odd of [null, undefined, "ok", [], {}, { ok: true }, { ok: true, id: "r-1", kind: "ORDER_FOOD" }, { ok: false, error: "BOOM" }]) {
      expect(toCreateOutcome(odd)).toEqual({ ok: false, error: { type: "SESSION_NOT_FOUND" } });
    }
  });
});

describe("toPublicServiceRequests", () => {
  it("reads the guest's own requests and skips entries it does not understand", () => {
    expect(
      toPublicServiceRequests([
        { id: "r-1", kind: "CALL_WAITER", status: "OPEN", created_at: "2026-10-14T11:50:00.000Z" },
        { id: "r-2", kind: "NOPE", status: "OPEN", created_at: "2026-10-14T11:50:00.000Z" },
        { id: "r-3", kind: "CLEAN_TABLE", status: "DONE", created_at: "not a date" },
        null,
        "junk",
        { id: "r-4", kind: "REQUEST_BILL", status: "DONE", created_at: "2026-10-14T11:40:00.000Z" },
      ]),
    ).toEqual([
      { id: "r-1", kind: "CALL_WAITER", status: "OPEN", createdAt: new Date("2026-10-14T11:50:00.000Z") },
      { id: "r-4", kind: "REQUEST_BILL", status: "DONE", createdAt: new Date("2026-10-14T11:40:00.000Z") },
    ]);
    expect(toPublicServiceRequests(null)).toEqual([]);
    expect(toPublicServiceRequests({})).toEqual([]);
  });
});
