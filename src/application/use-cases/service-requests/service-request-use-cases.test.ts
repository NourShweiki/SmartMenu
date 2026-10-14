import { describe, expect, it, vi } from "vitest";
import type { CreateServiceRequestOutcome, PublicServiceRequest, ServiceRequestGateway } from "@/application/ports/service-request-gateway";
import type { ServiceRequestRepository, WaitingServiceRequest } from "@/application/ports/service-request-repository";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import type { ServiceRequest, ServiceRequestId } from "@/domain/service-request/service-request";
import type { TableId, TableSessionId } from "@/domain/table-session/table-session";
import { err, ok } from "@/domain/shared/result";
import { makeGetGuestServices, makeListWaitingServiceRequests, makeRequestService, makeResolveServiceRequest } from "./service-request-use-cases";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const OTHER = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const NOW = new Date("2026-10-14T12:00:00Z");
const clock = { now: () => NOW };
const SESSION = "aaaaaaaa-5d5d-4000-8000-000000000001";
const actor = (role: Role, restaurantId = R) => ({ restaurantId, role });

const request = (over: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: "aaaaaaaa-5c5c-4000-8000-000000000001" as ServiceRequestId,
  restaurantId: R,
  sessionId: SESSION as TableSessionId,
  tableId: "table-7" as TableId,
  kind: "CALL_WAITER",
  status: "OPEN",
  createdAt: new Date("2026-10-14T11:50:00Z"),
  resolvedAt: null,
  ...over,
});

describe("requestService (a guest)", () => {
  const gateway = (outcome: CreateServiceRequestOutcome = ok({ id: "r-1", kind: "CALL_WAITER" })) => {
    const create = vi.fn(async () => outcome);
    return { create, port: { create, forSession: vi.fn() } as ServiceRequestGateway };
  };

  it("passes a valid request on to the database function with the restaurant from the host", async () => {
    const { create, port } = gateway();
    expect(await makeRequestService({ gateway: port })({ slug: "demo", sessionId: SESSION, kind: "CALL_WAITER" })).toEqual(ok({ id: "r-1", kind: "CALL_WAITER" }));
    expect(create).toHaveBeenCalledWith("demo", SESSION, "CALL_WAITER");
  });

  it("refuses a kind that is not one of the three, and a session id that cannot be a visit, without touching the database", async () => {
    const { create, port } = gateway();
    const run = makeRequestService({ gateway: port });
    for (const kind of ["", "ORDER_FOOD", "call_waiter", "CALL_WAITER; drop table"]) {
      expect(await run({ slug: "demo", sessionId: SESSION, kind })).toEqual(err({ type: "INVALID_KIND" }));
    }
    for (const sessionId of ["", "not-a-uuid", "../../etc"]) {
      expect(await run({ slug: "demo", sessionId, kind: "CLEAN_TABLE" })).toEqual(err({ type: "SESSION_NOT_FOUND" }));
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("passes the database's refusals through unchanged", async () => {
    for (const type of ["NOT_A_TABLE_VISIT", "SESSION_ENDED", "ALREADY_REQUESTED", "SESSION_NOT_FOUND"] as const) {
      const { port } = gateway(err({ type }));
      expect(await makeRequestService({ gateway: port })({ slug: "demo", sessionId: SESSION, kind: "REQUEST_BILL" })).toEqual(err({ type }));
    }
  });
});

describe("getGuestServices (a guest)", () => {
  const publicRequests: PublicServiceRequest[] = [
    { id: "r-3", kind: "CALL_WAITER", status: "OPEN", createdAt: new Date("2026-10-14T11:55:00Z") },
    { id: "r-2", kind: "CLEAN_TABLE", status: "DONE", createdAt: new Date("2026-10-14T11:50:00Z") },
    { id: "r-1", kind: "CALL_WAITER", status: "DONE", createdAt: new Date("2026-10-14T11:40:00Z") },
  ];

  it("returns the visit's requests and which kinds are still waiting (each once)", async () => {
    const forSession = vi.fn(async () => publicRequests);
    const result = await makeGetGuestServices({ gateway: { create: vi.fn(), forSession } })({ slug: "demo", sessionId: SESSION });
    expect(result.requests).toEqual(publicRequests);
    expect(result.waiting).toEqual(["CALL_WAITER"]);
    expect(forSession).toHaveBeenCalledWith("demo", SESSION);
  });

  it("is empty for a session id that cannot be a visit, without touching the database", async () => {
    const forSession = vi.fn(async () => publicRequests);
    expect(await makeGetGuestServices({ gateway: { create: vi.fn(), forSession } })({ slug: "demo", sessionId: "junk" })).toEqual({ requests: [], waiting: [] });
    expect(forSession).not.toHaveBeenCalled();
  });
});

describe("listWaitingServiceRequests (staff)", () => {
  const waiting: WaitingServiceRequest[] = [{ request: request(), tableLabel: "7" }];
  const repo = () => {
    const listWaiting = vi.fn(async () => waiting);
    return { listWaiting, deps: { requests: { listWaiting }, clock } };
  };

  it("lets the owner, manager and waiter see the list, asked for their own restaurant at the current time", async () => {
    for (const role of ["OWNER", "MANAGER", "WAITER"] as const) {
      const { listWaiting, deps } = repo();
      expect(await makeListWaitingServiceRequests(deps)(actor(role))).toEqual(ok(waiting));
      expect(listWaiting).toHaveBeenCalledWith(R, NOW);
    }
  });

  it("refuses the cashier (spec: the waiter's screen only) before reading anything", async () => {
    const { listWaiting, deps } = repo();
    expect(await makeListWaitingServiceRequests(deps)(actor("CASHIER"))).toEqual(err({ type: "FORBIDDEN" }));
    expect(listWaiting).not.toHaveBeenCalled();
  });
});

describe("resolveServiceRequest (staff)", () => {
  const setup = (stored: ServiceRequest | null, markDone = true) => {
    const findById = vi.fn(async () => stored);
    const markDoneFn = vi.fn(async () => markDone);
    return { findById, markDone: markDoneFn, run: makeResolveServiceRequest({ requests: { findById, markDone: markDoneFn } as Pick<ServiceRequestRepository, "findById" | "markDone">, clock }) };
  };
  const id = request().id;

  it("lets the waiter mark a waiting request done", async () => {
    const { run, markDone } = setup(request());
    expect(await run(actor("WAITER"), { requestId: id })).toEqual(ok({ ...request(), status: "DONE", resolvedAt: NOW }));
    expect(markDone).toHaveBeenCalledWith(R, id);
  });

  it("refuses the cashier before looking anything up", async () => {
    const { run, findById, markDone } = setup(request());
    expect(await run(actor("CASHIER"), { requestId: id })).toEqual(err({ type: "FORBIDDEN" }));
    expect(findById).not.toHaveBeenCalled();
    expect(markDone).not.toHaveBeenCalled();
  });

  it("says not found for an unknown request, and for another restaurant's request even if the repository returned it", async () => {
    expect(await setup(null).run(actor("WAITER"), { requestId: id })).toEqual(err({ type: "REQUEST_NOT_FOUND" }));
    const foreign = setup(request({ restaurantId: OTHER }));
    expect(await foreign.run(actor("WAITER"), { requestId: id })).toEqual(err({ type: "REQUEST_NOT_FOUND" }));
    expect(foreign.markDone).not.toHaveBeenCalled();
  });

  it("refuses a request that is already done", async () => {
    const { run, markDone } = setup(request({ status: "DONE", resolvedAt: NOW }));
    expect(await run(actor("MANAGER"), { requestId: id })).toEqual(err({ type: "ALREADY_DONE" }));
    expect(markDone).not.toHaveBeenCalled();
  });

  it("reports a conflict when someone else resolved it first (or the database refused)", async () => {
    expect(await setup(request(), false).run(actor("OWNER"), { requestId: id })).toEqual(err({ type: "CONFLICT" }));
  });
});
