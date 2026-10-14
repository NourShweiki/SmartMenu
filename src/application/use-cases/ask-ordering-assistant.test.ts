import { describe, expect, it, vi } from "vitest";
import type { AssistantAnswer, AssistantTurn, OrderingAssistant } from "@/application/ports/ordering-assistant";
import type { PublicMenuRepository, PublicMenuSection } from "@/application/ports/public-menu-repository";
import { EMPTY_CART } from "@/domain/cart/cart";
import { createCategory, createMenuItem, setItemHidden, setItemSoldOut, type MenuCategory, type MenuItem } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { err, ok, type Result } from "@/domain/shared/result";
import { makeAskOrderingAssistant, MAX_HISTORY_TURNS, MAX_TURN_CHARS } from "./ask-ordering-assistant";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
const RATES = { taxRateBp: 1600, serviceChargeBp: 1000 };
let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const category: MenuCategory = unwrap(createCategory(R, { name: { en: "Grill", ar: "مشاوي" }, sortOrder: 0 }, ids));
const mk = (en: string): MenuItem => unwrap(createMenuItem(category, { name: { en, ar: en }, description: { en: "", ar: "" }, priceFils: 4500, sortOrder: 0 }, ids));
const kebab = mk("Kebab");
const soldOut = unwrap(setItemSoldOut(mk("Mansaf"), true));
const secret = unwrap(setItemHidden(mk("Secret"), true));
const sections: PublicMenuSection[] = [{ category, items: [kebab, soldOut, secret].map((item) => ({ item, groups: [] })) }];
const repo: PublicMenuRepository = { findForRestaurant: async () => sections };

const customer = (text: string) => ({ role: "customer" as const, text });
const fakeAssistant = (answer: Result<AssistantAnswer, { type: "SERVICE_FAILED" } | { type: "BAD_ANSWER" }>, available = true) => {
  const reply = vi.fn(async () => answer);
  const assistant: OrderingAssistant = { isAvailable: () => available, reply };
  return { assistant, reply };
};
const run = (assistant: OrderingAssistant, history: AssistantTurn[] = [customer("two kebabs please")]) =>
  makeAskOrderingAssistant({ menu: repo, assistant })({ restaurant: { id: R, slug: "demo" }, rates: RATES, history, cart: EMPTY_CART });
const suggest = (...lines: { id: string; quantity?: number }[]) =>
  ok<AssistantAnswer>({ message: "Sure", proposed: lines.map((l) => ({ menuItemId: l.id, optionIds: [], quantity: l.quantity ?? 1 })) });

describe("askOrderingAssistant", () => {
  it("adds what the assistant suggests and the menu allows, and keeps its message", async () => {
    const { assistant } = fakeAssistant(suggest({ id: kebab.id, quantity: 2 }));
    const result = unwrap(await run(assistant));
    expect(result.message).toBe("Sure");
    expect(result.cart.lines.map((l) => [l.menuItemId, l.quantity])).toEqual([[kebab.id, 2]]);
    expect(result.rejected).toEqual([]);
  });

  it("never lets an invented, sold-out or hidden item into the cart, and says why", async () => {
    const { assistant } = fakeAssistant(suggest({ id: "invented" }, { id: soldOut.id }, { id: secret.id }, { id: kebab.id }));
    const result = unwrap(await run(assistant));
    expect(result.cart.lines.map((l) => l.menuItemId)).toEqual([kebab.id]);
    expect(result.rejected.map((r) => r.reason)).toEqual(["UNKNOWN_ITEM", "ITEM_UNAVAILABLE", "UNKNOWN_ITEM"]);
  });

  it("shows the assistant only what customers see: no hidden item", async () => {
    const { assistant, reply } = fakeAssistant(suggest());
    await run(assistant);
    const sent = (reply.mock.calls[0] as unknown as [{ menu: PublicMenuSection[] }])[0].menu;
    expect(sent.flatMap((s) => s.items.map((i) => i.item.name.en))).toEqual(["Kebab", "Mansaf"]);
  });

  it("is not configured without a key, and asks nothing", async () => {
    const { assistant, reply } = fakeAssistant(suggest(), false);
    expect(await run(assistant)).toEqual(err({ type: "NOT_CONFIGURED" }));
    expect(reply).not.toHaveBeenCalled();
  });

  it("needs a message from the customer to answer", async () => {
    const { assistant, reply } = fakeAssistant(suggest());
    expect(await run(assistant, [])).toEqual(err({ type: "EMPTY_MESSAGE" }));
    expect(await run(assistant, [customer("   ")])).toEqual(err({ type: "EMPTY_MESSAGE" }));
    expect(await run(assistant, [customer("hi"), { role: "assistant", text: "hello" }])).toEqual(err({ type: "EMPTY_MESSAGE" }));
    expect(reply).not.toHaveBeenCalled();
  });

  it("cuts a long chat to the last turns and each turn to a length", async () => {
    const { assistant, reply } = fakeAssistant(suggest());
    const long = Array.from({ length: MAX_HISTORY_TURNS + 5 }, (_, i) => customer(`${i} ${"x".repeat(MAX_TURN_CHARS * 2)}`));
    await run(assistant, long);
    const sent = (reply.mock.calls[0] as unknown as [{ history: { text: string }[] }])[0].history;
    expect(sent).toHaveLength(MAX_HISTORY_TURNS);
    expect(sent[0]?.text.startsWith("5 ")).toBe(true);
    expect(sent.every((t) => t.text.length <= MAX_TURN_CHARS)).toBe(true);
  });

  it("reports a failing or confused service as a failure, and leaves the cart alone", async () => {
    expect(await run(fakeAssistant(err({ type: "SERVICE_FAILED" })).assistant)).toEqual(err({ type: "SERVICE_FAILED" }));
    expect(await run(fakeAssistant(err({ type: "BAD_ANSWER" })).assistant)).toEqual(err({ type: "SERVICE_FAILED" }));
  });
});
