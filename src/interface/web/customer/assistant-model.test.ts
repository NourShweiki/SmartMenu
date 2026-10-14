import { describe, expect, it, vi } from "vitest";
import type { PublicRestaurant } from "@/application/ports/restaurant-repository";
import type { AskOrderingAssistantInput, AskOrderingAssistantOutput } from "@/application/use-cases/ask-ordering-assistant";
import { EMPTY_CART } from "@/domain/cart/cart";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import { askAssistant, MAX_REQUEST_TURNS, readHistory } from "./assistant-model";
import { makeRateLimiter } from "./rate-limit";

const restaurant = {
  id: "11111111-1111-4000-8000-000000000001" as RestaurantId,
  slug: "demo",
  settings: { taxRateBp: 1600, serviceChargeBp: 1000 },
} as unknown as PublicRestaurant;

const good: AskOrderingAssistantOutput = {
  message: "Done",
  cart: { lines: [{ key: "k", menuItemId: "m" as never, optionIds: [], quantity: 2 }] },
  added: [{ menuItemId: "m", optionIds: [], quantity: 2 }],
  rejected: [{ proposed: { menuItemId: "x", optionIds: [], quantity: 1 }, reason: "UNKNOWN_ITEM" }],
};
const history = [{ role: "customer", text: "two kebabs" }];

const setup = (answer: Result<AskOrderingAssistantOutput, { type: "NOT_CONFIGURED" | "EMPTY_MESSAGE" | "SERVICE_FAILED" }> = ok(good), max = 100) => {
  const ask = vi.fn<(input: AskOrderingAssistantInput) => Promise<typeof answer>>(async () => answer);
  const deps = { ask, deviceLimit: makeRateLimiter({ max, windowMs: 1000 }), restaurantLimit: makeRateLimiter({ max: 100, windowMs: 1000 }) };
  return { ask, run: (h: unknown = history, cart: unknown = EMPTY_CART, clientHash: string | null = "dev") => askAssistant(deps, { restaurant, history: h, cart, clientHash }) };
};

describe("readHistory", () => {
  it("reads a well-formed chat and refuses anything else, whole", () => {
    expect(readHistory(history)).toEqual(history);
    expect(readHistory([])).toEqual([]);
    for (const bad of ["hi", null, [{ role: "system", text: "x" }], [{ role: "customer", text: 5 }], [null], [{ role: "customer", text: "ok" }, "junk"]]) {
      expect(readHistory(bad)).toBeNull();
    }
    expect(readHistory(Array.from({ length: MAX_REQUEST_TURNS + 1 }, () => history[0]))).toBeNull();
  });
});

describe("askAssistant", () => {
  it("asks with the restaurant and rates from the server side, and shapes the answer", async () => {
    const { ask, run } = setup();
    expect(await run()).toEqual({ ok: true, message: "Done", cart: good.cart, added: 1, rejected: ["UNKNOWN_ITEM"] });
    expect(ask.mock.calls[0]?.[0]).toMatchObject({ restaurant: { id: restaurant.id, slug: "demo" }, rates: { taxRateBp: 1600, serviceChargeBp: 1000 }, history });
  });

  it("reads the browser's cart forgivingly: a damaged saved cart does not break the chat", async () => {
    const { ask, run } = setup();
    await run(history, { lines: [{ menuItemId: "a", optionIds: [], quantity: 2 }, "junk"] });
    expect(ask.mock.calls[0]?.[0].cart.lines.map((l) => [l.menuItemId, l.quantity])).toEqual([["a", 2]]);
  });

  it("refuses a malformed request before anything is asked or counted", async () => {
    const { ask, run } = setup(ok(good), 1);
    expect(await run("nonsense")).toEqual({ ok: false, problem: "invalidRequest" });
    expect(ask).not.toHaveBeenCalled();
    expect((await run()).ok).toBe(true); // the refused request did not use up the device's one allowed question
  });

  it("limits how often one device may ask, and a device without a known address shares one bucket", async () => {
    const { ask, run } = setup(ok(good), 2);
    expect([(await run()).ok, (await run()).ok, (await run()).ok]).toEqual([true, true, false]);
    expect(await run()).toEqual({ ok: false, problem: "tooMany" });
    expect((await run(history, EMPTY_CART, "other-device")).ok).toBe(true);
    expect(ask).toHaveBeenCalledTimes(3);
    expect((await run(history, EMPTY_CART, null)).ok).toBe(true);
  });

  it("limits the whole restaurant too, so a visitor who changes address cannot run the bill up", async () => {
    const ask = vi.fn(async () => ok(good));
    const deps = { ask, deviceLimit: makeRateLimiter({ max: 100, windowMs: 1000 }), restaurantLimit: makeRateLimiter({ max: 1, windowMs: 1000 }) };
    const send = (clientHash: string) => askAssistant(deps, { restaurant, history, cart: EMPTY_CART, clientHash });
    expect((await send("a")).ok).toBe(true);
    expect(await send("b")).toEqual({ ok: false, problem: "tooMany" });
  });

  it("maps the use case's failures to the problems the chat shows", async () => {
    expect(await setup(err({ type: "NOT_CONFIGURED" })).run()).toEqual({ ok: false, problem: "notAvailable" });
    expect(await setup(err({ type: "EMPTY_MESSAGE" })).run()).toEqual({ ok: false, problem: "emptyMessage" });
    expect(await setup(err({ type: "SERVICE_FAILED" })).run()).toEqual({ ok: false, problem: "failed" });
  });
});
