import { describe, expect, it } from "vitest";
import { moveInOrder } from "./ordering";

const list = (...ids: string[]) => ids.map((id, sortOrder) => ({ id, sortOrder }));

describe("moveInOrder", () => {
  it("swaps with the neighbour and only reports what changed", () => {
    expect(moveInOrder(list("a", "b", "c"), "b", "up")).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
    ]);
    expect(moveInOrder(list("a", "b", "c"), "b", "down")).toEqual([
      { id: "c", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("does nothing at the edges or for unknown ids", () => {
    expect(moveInOrder(list("a", "b"), "a", "up")).toEqual([]);
    expect(moveInOrder(list("a", "b"), "b", "down")).toEqual([]);
    expect(moveInOrder(list("a", "b"), "zzz", "up")).toEqual([]);
  });

  it("repairs duplicate or gappy sort orders while moving", () => {
    const messy = [
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 0 },
      { id: "c", sortOrder: 7 },
    ];
    expect(moveInOrder(messy, "c", "up")).toEqual([
      { id: "c", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });
});
