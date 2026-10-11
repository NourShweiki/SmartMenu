import { describe, expect, it } from "vitest";
import type { SessionAtTable, TableSessionRepository } from "@/application/ports/table-session-repository";
import type { Order, OrderStatus } from "@/domain/order/order";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import type { Role } from "@/domain/restaurant/role";
import type { SessionStatus, TableId, TableSessionId } from "@/domain/table-session/table-session";
import { makeMoveTableSession } from "./move-table-session";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const OTHER = "22222222-2222-4000-8000-000000000002" as RestaurantId;
const SESSION = "33333333-3333-4000-8000-000000000003" as TableSessionId;
const NOW = new Date("2026-10-11T20:00:00Z");
const clock = { now: () => NOW };
const actor = (role: Role, restaurantId = R) => ({ restaurantId, role });

/** One visit at table 7 in an in-memory store that behaves like the database: a move only if the status still matches. */
function store(status: SessionStatus, options: { minutesAgo?: number; restaurantId?: RestaurantId; refuse?: boolean; orders?: OrderStatus[] } = {}) {
  const state = {
    visit: {
      tableLabel: "7",
      session: {
        id: SESSION,
        restaurantId: options.restaurantId ?? R,
        kind: "TABLE",
        tableId: "table-7" as TableId,
        customer: null,
        status,
        startedAt: new Date(NOW.getTime() - (options.minutesAgo ?? 30) * 60_000),
        endedAt: status === "CLOSED" ? NOW : null,
      },
    } as SessionAtTable,
    writes: [] as { from: SessionStatus; to: SessionStatus }[],
  };
  const orders = {
    listBySession: async () => (options.orders ?? []).map((s, i) => ({ id: `order-${i}`, status: s }) as unknown as Order),
  };
  const repo: Pick<TableSessionRepository, "findWithTables" | "updateStatus"> = {
    findWithTables: async (restaurantId, ids) =>
      state.visit.session.restaurantId === restaurantId && ids.includes(state.visit.session.id) ? [state.visit] : [],
    updateStatus: async (restaurantId, id, from, to) => {
      state.writes.push({ from, to });
      const { session } = state.visit;
      if (options.refuse || session.restaurantId !== restaurantId || session.id !== id || session.status !== from) return false;
      state.visit = { ...state.visit, session: { ...session, status: to } };
      return true;
    },
  };
  return { state, move: makeMoveTableSession({ sessions: repo, orders, clock }) };
}

describe("moveTableSession", () => {
  it("lets the waiter signal 'ready to pay', and the cashier close the visit after payment", async () => {
    const { state, move } = store("OPEN");
    const requested = await move(actor("WAITER"), { sessionId: SESSION, to: "PAYMENT_REQUESTED" });
    expect(requested).toMatchObject({ ok: true, value: { tableLabel: "7", session: { status: "PAYMENT_REQUESTED", endedAt: null } } });

    const closed = await move(actor("CASHIER"), { sessionId: SESSION, to: "CLOSED" });
    expect(closed).toMatchObject({ ok: true, value: { tableLabel: "7", session: { status: "CLOSED", endedAt: NOW } } });
    expect(state.writes).toEqual([
      { from: "OPEN", to: "PAYMENT_REQUESTED" },
      { from: "PAYMENT_REQUESTED", to: "CLOSED" },
    ]);
  });

  it("keeps each role to its own move: the waiter cannot close, the cashier cannot signal payment", async () => {
    const open = store("OPEN");
    expect(await open.move(actor("WAITER"), { sessionId: SESSION, to: "CLOSED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(await open.move(actor("CASHIER"), { sessionId: SESSION, to: "PAYMENT_REQUESTED" })).toEqual({ ok: false, error: { type: "FORBIDDEN" } });
    expect(open.state.writes).toEqual([]); // refused before anything is touched
    // Owner and manager can do both; the cashier may also end an open visit by hand (the guests left).
    for (const role of ["OWNER", "MANAGER"] as const) {
      const s = store("OPEN");
      expect((await s.move(actor(role), { sessionId: SESSION, to: "PAYMENT_REQUESTED" })).ok).toBe(true);
      expect((await s.move(actor(role), { sessionId: SESSION, to: "CLOSED" })).ok).toBe(true);
    }
    expect((await store("OPEN").move(actor("CASHIER"), { sessionId: SESSION, to: "CLOSED" })).ok).toBe(true);
  });

  it("refuses moves the visit's lifecycle does not have: nothing after CLOSED, no repeat, no reopening", async () => {
    const invalid = (from: SessionStatus, to: SessionStatus) => ({ ok: false, error: { type: "INVALID_TRANSITION", from, to } });
    const closed = store("CLOSED");
    expect(await closed.move(actor("OWNER"), { sessionId: SESSION, to: "PAYMENT_REQUESTED" })).toEqual(invalid("CLOSED", "PAYMENT_REQUESTED"));
    expect(await closed.move(actor("OWNER"), { sessionId: SESSION, to: "CLOSED" })).toEqual(invalid("CLOSED", "CLOSED"));
    const requested = store("PAYMENT_REQUESTED");
    expect(await requested.move(actor("OWNER"), { sessionId: SESSION, to: "PAYMENT_REQUESTED" })).toEqual(invalid("PAYMENT_REQUESTED", "PAYMENT_REQUESTED"));
    expect(await requested.move(actor("OWNER"), { sessionId: SESSION, to: "OPEN" })).toEqual(invalid("PAYMENT_REQUESTED", "OPEN"));
    expect([...closed.state.writes, ...requested.state.writes]).toEqual([]);
  });

  it("treats a visit past its two hours as closed for 'ready to pay', but still lets it be closed properly", async () => {
    const stale = store("OPEN", { minutesAgo: 121 });
    expect(await stale.move(actor("WAITER"), { sessionId: SESSION, to: "PAYMENT_REQUESTED" })).toEqual({
      ok: false,
      error: { type: "INVALID_TRANSITION", from: "CLOSED", to: "PAYMENT_REQUESTED" },
    });
    expect(stale.state.writes).toEqual([]);
    // Closing brings the stored record in line: it moves from what is STORED (OPEN), not from the effective CLOSED.
    expect(await stale.move(actor("CASHIER"), { sessionId: SESSION, to: "CLOSED" })).toMatchObject({ ok: true, value: { session: { status: "CLOSED", endedAt: NOW } } });
    expect(stale.state.writes).toEqual([{ from: "OPEN", to: "CLOSED" }]);
  });

  it("does not close a visit that still has unfinished orders, and says how many", async () => {
    const busy = store("PAYMENT_REQUESTED", { orders: ["COMPLETED", "SERVED", "PREPARING"] });
    expect(await busy.move(actor("CASHIER"), { sessionId: SESSION, to: "CLOSED" })).toEqual({ ok: false, error: { type: "UNFINISHED_ORDERS", count: 2 } });
    expect(busy.state.writes).toEqual([]);
    // The same for a visit that ran out of time: its orders have to be settled first too.
    const stale = store("OPEN", { minutesAgo: 121, orders: ["NEW"] });
    expect(await stale.move(actor("OWNER"), { sessionId: SESSION, to: "CLOSED" })).toEqual({ ok: false, error: { type: "UNFINISHED_ORDERS", count: 1 } });

    // Every order completed (or none at all): it closes.
    expect((await store("PAYMENT_REQUESTED", { orders: ["COMPLETED", "COMPLETED"] }).move(actor("CASHIER"), { sessionId: SESSION, to: "CLOSED" })).ok).toBe(true);
    expect((await store("OPEN", { orders: [] }).move(actor("CASHIER"), { sessionId: SESSION, to: "CLOSED" })).ok).toBe(true);
  });

  it("lets the waiter signal 'ready to pay' while orders are still on their way", async () => {
    const eating = store("OPEN", { orders: ["PREPARING", "NEW"] });
    expect((await eating.move(actor("WAITER"), { sessionId: SESSION, to: "PAYMENT_REQUESTED" })).ok).toBe(true);
  });

  it("does not find a visit that is unknown or another restaurant's", async () => {
    const notFound = { ok: false, error: { type: "SESSION_NOT_FOUND" } };
    const mine = store("OPEN");
    expect(await mine.move(actor("OWNER"), { sessionId: "44444444-4444-4000-8000-000000000004" as TableSessionId, to: "CLOSED" })).toEqual(notFound);
    expect(await mine.move(actor("OWNER", OTHER), { sessionId: SESSION, to: "CLOSED" })).toEqual(notFound);
    expect(mine.state.writes).toEqual([]);
  });

  it("reports a conflict when the store does not make the move (someone else was first, or the database refused)", async () => {
    const { state, move } = store("OPEN", { refuse: true });
    expect(await move(actor("WAITER"), { sessionId: SESSION, to: "PAYMENT_REQUESTED" })).toEqual({ ok: false, error: { type: "CONFLICT" } });
    expect(state.visit.session.status).toBe("OPEN"); // never reports a change that did not happen
  });
});
