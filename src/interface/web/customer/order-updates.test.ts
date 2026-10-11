import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@/domain/order/order";
import { orderUpdates } from "./order-updates";

const o = (number: number, status: OrderStatus) => ({ number, status });

describe("orderUpdates", () => {
  it("reports nothing when the page has just opened, even for an order that is already ready", () => {
    const first = orderUpdates(null, [o(1, "READY"), o(2, "CANCELLED"), o(3, "NEW")]);
    expect([first.ready, first.cancelled]).toEqual([[], []]);
    expect([...first.seen]).toEqual([[1, "READY"], [2, "CANCELLED"], [3, "NEW"]]);
  });

  it("reports an order once, at the moment it becomes ready", () => {
    let state = orderUpdates(null, [o(1, "NEW")]);
    state = orderUpdates(state.seen, [o(1, "PREPARING")]);
    expect(state.ready).toEqual([]);
    state = orderUpdates(state.seen, [o(1, "READY")]);
    expect(state.ready).toEqual([1]);
    state = orderUpdates(state.seen, [o(1, "READY")]); // the next look: still ready, not news
    expect(state.ready).toEqual([]);
    state = orderUpdates(state.seen, [o(1, "SERVED")]);
    expect([state.ready, state.cancelled]).toEqual([[], []]);
  });

  it("reports a cancellation once, whatever step the order was at", () => {
    let state = orderUpdates(null, [o(1, "NEW"), o(2, "READY")]);
    state = orderUpdates(state.seen, [o(1, "CANCELLED"), o(2, "CANCELLED")]);
    expect(state.cancelled).toEqual([1, 2]);
    expect(orderUpdates(state.seen, [o(1, "CANCELLED"), o(2, "CANCELLED")]).cancelled).toEqual([]);
  });

  it("reports several orders at once, and an order first seen already ready (placed from another phone at the table)", () => {
    const state = orderUpdates(null, [o(1, "PREPARING")]);
    const next = orderUpdates(state.seen, [o(1, "READY"), o(2, "READY"), o(3, "NEW")]);
    expect(next.ready).toEqual([1, 2]);
    expect(next.cancelled).toEqual([]);
  });
});
