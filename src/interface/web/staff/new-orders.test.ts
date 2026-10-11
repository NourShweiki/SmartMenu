import { describe, expect, it } from "vitest";
import { arrivals } from "./new-orders";

describe("arrivals", () => {
  it("announces nothing when the screen has just opened: what is there is the starting point", () => {
    const first = arrivals(null, ["a", "b"]);
    expect(first.arrived).toEqual([]);
    expect([...first.seen]).toEqual(["a", "b"]);
  });

  it("announces exactly the orders that were not there before", () => {
    const { seen } = arrivals(null, ["a", "b"]);
    const next = arrivals(seen, ["a", "b", "c", "d"]);
    expect(next.arrived).toEqual(["c", "d"]);
    expect(arrivals(next.seen, ["a", "b", "c", "d"]).arrived).toEqual([]); // the same list again: silence
  });

  it("announces an order once, even if it leaves the list and shows up again", () => {
    let state = arrivals(null, []);
    state = arrivals(state.seen, ["a"]);
    expect(state.arrived).toEqual(["a"]);
    state = arrivals(state.seen, []); // confirmed by someone: no longer among the new ones
    expect(state.arrived).toEqual([]);
    state = arrivals(state.seen, ["a"]);
    expect(state.arrived).toEqual([]);
  });

  it("announces the first order of an empty screen", () => {
    const empty = arrivals(null, []);
    expect(arrivals(empty.seen, ["a"]).arrived).toEqual(["a"]);
  });
});
