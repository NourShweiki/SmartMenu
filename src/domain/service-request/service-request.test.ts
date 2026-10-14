import { describe, expect, it } from "vitest";
import { can } from "@/domain/restaurant/role";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { TableId, TableSession, TableSessionId } from "@/domain/table-session/table-session";
import {
  createServiceRequest,
  isServiceKind,
  openKindsOf,
  resolveServiceRequest,
  SERVICE_KINDS,
  waitingRequests,
  type ServiceKind,
  type ServiceRequest,
} from "./service-request";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const NOW = new Date("2026-10-14T12:00:00Z");
const minutesLater = (m: number) => new Date(NOW.getTime() + m * 60_000);
let n = 0;
const ids = { newId: () => `req-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const table = (over: Partial<TableSession> = {}): TableSession => ({
  id: "session-1" as TableSessionId,
  restaurantId: R,
  kind: "TABLE",
  tableId: "table-7" as TableId,
  customer: null,
  status: "OPEN",
  startedAt: NOW,
  endedAt: null,
  ...over,
});
const request = (over: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: "r" as ServiceRequest["id"],
  restaurantId: R,
  sessionId: "session-1" as TableSessionId,
  tableId: "table-7" as TableId,
  kind: "CALL_WAITER",
  status: "OPEN",
  createdAt: NOW,
  resolvedAt: null,
  ...over,
});

describe("createServiceRequest", () => {
  it("creates a waiting request for each kind, tied to the visit and its table", () => {
    for (const kind of SERVICE_KINDS) {
      expect(unwrap(createServiceRequest(table(), kind, [], ids, NOW))).toMatchObject({
        restaurantId: R,
        sessionId: "session-1",
        tableId: "table-7",
        kind,
        status: "OPEN",
        createdAt: NOW,
        resolvedAt: null,
      });
    }
  });

  it("refuses a kind that is not one of the three (the browser sent it)", () => {
    for (const kind of ["", "call_waiter", "ORDER_FOOD", "CALL_WAITER "]) {
      expect(createServiceRequest(table(), kind, [], ids, NOW)).toEqual({ ok: false, error: { type: "INVALID_KIND" } });
    }
    expect(isServiceKind("CLEAN_TABLE")).toBe(true);
    expect(isServiceKind(undefined)).toBe(false);
  });

  it("refuses a takeout (pickup) visit: there is no table to serve", () => {
    const pickup = table({ kind: "PICKUP", tableId: null, customer: { name: "Sara", phone: "+962791234567" } });
    expect(createServiceRequest(pickup, "CALL_WAITER", [], ids, NOW)).toEqual({ ok: false, error: { type: "NOT_A_TABLE_VISIT" } });
  });

  it("refuses a visit that is closed, or past its 2 hours even if its stored status still says OPEN", () => {
    expect(createServiceRequest(table({ status: "CLOSED" }), "CALL_WAITER", [], ids, NOW)).toEqual({ ok: false, error: { type: "SESSION_ENDED" } });
    expect(createServiceRequest(table(), "CALL_WAITER", [], ids, minutesLater(119)).ok).toBe(true);
    expect(createServiceRequest(table(), "CALL_WAITER", [], ids, minutesLater(120))).toEqual({ ok: false, error: { type: "SESSION_ENDED" } });
  });

  it("allows one waiting request per kind per visit, but other kinds are separate", () => {
    expect(createServiceRequest(table(), "CALL_WAITER", ["CALL_WAITER"], ids, NOW)).toEqual({ ok: false, error: { type: "ALREADY_REQUESTED" } });
    expect(createServiceRequest(table(), "CLEAN_TABLE", ["CALL_WAITER"], ids, NOW).ok).toBe(true);
  });

  it("does not take a bill request once the waiter has already signalled 'ready to pay'", () => {
    const paying = table({ status: "PAYMENT_REQUESTED" });
    expect(createServiceRequest(paying, "REQUEST_BILL", [], ids, NOW)).toEqual({ ok: false, error: { type: "ALREADY_REQUESTED" } });
    expect(createServiceRequest(paying, "CALL_WAITER", [], ids, NOW).ok).toBe(true); // the guest can still call the waiter
  });
});

describe("resolveServiceRequest", () => {
  it("marks a waiting request done and stamps the time; done is final", () => {
    const done = unwrap(resolveServiceRequest(request(), minutesLater(3)));
    expect(done).toMatchObject({ status: "DONE", resolvedAt: minutesLater(3) });
    expect(resolveServiceRequest(done, minutesLater(4))).toEqual({ ok: false, error: { type: "ALREADY_DONE" } });
  });
});

describe("openKindsOf and waitingRequests", () => {
  const requests = [
    request({ id: "a" as ServiceRequest["id"], kind: "REQUEST_BILL", createdAt: minutesLater(5) }),
    request({ id: "b" as ServiceRequest["id"], kind: "CALL_WAITER", createdAt: minutesLater(1) }),
    request({ id: "c" as ServiceRequest["id"], kind: "CLEAN_TABLE", status: "DONE", resolvedAt: minutesLater(2) }),
    request({ id: "d" as ServiceRequest["id"], kind: "CALL_WAITER", sessionId: "other-visit" as TableSessionId, createdAt: minutesLater(2) }),
  ];

  it("lists the kinds still waiting for ONE visit (done ones and other visits do not count), without repeats", () => {
    const kinds: ServiceKind[] = openKindsOf([...requests, request({ id: "e" as ServiceRequest["id"], kind: "CALL_WAITER" })], "session-1" as TableSessionId);
    expect(kinds.sort()).toEqual(["CALL_WAITER", "REQUEST_BILL"]);
  });

  it("shows the waiter only what is waiting, longest-waiting first", () => {
    expect(waitingRequests(requests).map((r) => r.id)).toEqual(["b", "d", "a"]);
  });
});

describe("who may handle service requests (spec §4)", () => {
  it("owner, manager and waiter may; the cashier may not", () => {
    expect(["OWNER", "MANAGER", "WAITER", "CASHIER"].map((role) => can(role as "OWNER", "service-requests:handle"))).toEqual([true, true, true, false]);
  });
});
