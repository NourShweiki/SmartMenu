import { describe, expect, it, vi } from "vitest";
import type { CreateServiceRequestOutcome } from "@/application/ports/service-request-gateway";
import { err, ok } from "@/domain/shared/result";
import { makeRateLimiter } from "./rate-limit";
import { askForService, toServiceOutcome } from "./service-model";

const SESSION = "aaaaaaaa-5d5d-4000-8000-000000000001";

describe("toServiceOutcome", () => {
  it("shows a made request with its kind", () => {
    expect(toServiceOutcome(ok({ id: "r-1", kind: "CLEAN_TABLE" }))).toEqual({ ok: true, kind: "CLEAN_TABLE" });
  });

  it("maps every refusal to a problem the page can explain", () => {
    const problem = (type: "ALREADY_REQUESTED" | "NOT_A_TABLE_VISIT" | "INVALID_KIND" | "SESSION_ENDED" | "SESSION_NOT_FOUND") =>
      toServiceOutcome(err({ type }));
    expect(problem("ALREADY_REQUESTED")).toEqual({ ok: false, problem: "alreadyRequested" });
    expect(problem("NOT_A_TABLE_VISIT")).toEqual({ ok: false, problem: "notATable" });
    expect(problem("INVALID_KIND")).toEqual({ ok: false, problem: "invalidRequest" });
    expect(problem("SESSION_ENDED")).toEqual({ ok: false, problem: "sessionEnded" });
    expect(problem("SESSION_NOT_FOUND")).toEqual({ ok: false, problem: "sessionEnded" }); // an old cookie: scan again
  });
});

describe("askForService", () => {
  const setup = (answer: CreateServiceRequestOutcome = ok({ id: "r-1", kind: "CALL_WAITER" }), deviceMax = 100) => {
    const request = vi.fn<(input: { slug: string; sessionId: string; kind: string }) => Promise<CreateServiceRequestOutcome>>(async () => answer);
    const deps = { request, deviceLimit: makeRateLimiter({ max: deviceMax, windowMs: 1000 }), restaurantLimit: makeRateLimiter({ max: 100, windowMs: 1000 }) };
    return { request, run: (kind: unknown = "CALL_WAITER", sessionId: string | null = SESSION, clientHash: string | null = "dev") => askForService(deps, { slug: "demo", restaurantId: "r", sessionId, kind, clientHash }) };
  };

  it("asks with the restaurant from the host and the visit from the cookie, and answers with the kind", async () => {
    const { request, run } = setup();
    expect(await run("CALL_WAITER")).toEqual({ ok: true, kind: "CALL_WAITER" });
    expect(request).toHaveBeenCalledWith({ slug: "demo", sessionId: SESSION, kind: "CALL_WAITER" });
  });

  it("refuses what the page never sends, and a device with no table, before counting or asking anything", async () => {
    const { request, run } = setup(ok({ id: "r-1", kind: "CALL_WAITER" }), 1);
    expect(await run({ kind: "CALL_WAITER" })).toEqual({ ok: false, problem: "invalidRequest" });
    expect(await run(null)).toEqual({ ok: false, problem: "invalidRequest" });
    expect(await run(42)).toEqual({ ok: false, problem: "invalidRequest" });
    expect(await run("CALL_WAITER", null)).toEqual({ ok: false, problem: "notATable" });
    expect(request).not.toHaveBeenCalled();
    expect((await run()).ok).toBe(true); // none of those used up the device's one allowed request
  });

  it("limits how often one device may ask, and a device without a known address is not put in a shared bucket", async () => {
    const { request, run } = setup(ok({ id: "r-1", kind: "CALL_WAITER" }), 2);
    expect([(await run()).ok, (await run()).ok, (await run()).ok]).toEqual([true, true, false]);
    expect(await run()).toEqual({ ok: false, problem: "tooMany" });
    expect((await run("CALL_WAITER", SESSION, "other-device")).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect((await run("CALL_WAITER", SESSION, null)).ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(8);
  });

  it("limits the whole restaurant too", async () => {
    const request = vi.fn(async () => ok({ id: "r-1", kind: "CALL_WAITER" as const }));
    const deps = { request, deviceLimit: makeRateLimiter({ max: 100, windowMs: 1000 }), restaurantLimit: makeRateLimiter({ max: 1, windowMs: 1000 }) };
    const send = (clientHash: string) => askForService(deps, { slug: "demo", restaurantId: "r", sessionId: SESSION, kind: "CALL_WAITER", clientHash });
    expect((await send("a")).ok).toBe(true);
    expect(await send("b")).toEqual({ ok: false, problem: "tooMany" });
  });

  it("passes the database's refusals on as problems", async () => {
    expect(await setup(err({ type: "ALREADY_REQUESTED" })).run()).toEqual({ ok: false, problem: "alreadyRequested" });
    expect(await setup(err({ type: "SESSION_ENDED" })).run()).toEqual({ ok: false, problem: "sessionEnded" });
  });
});
