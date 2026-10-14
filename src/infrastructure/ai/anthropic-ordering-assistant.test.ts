import { describe, expect, it, vi } from "vitest";
import type { PublicMenuSection } from "@/application/ports/public-menu-repository";
import { createCategory, createMenuItem, setItemSoldOut } from "@/domain/menu/menu";
import { createOption, createOptionGroup } from "@/domain/menu/options";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { AnthropicOrderingAssistant, DEFAULT_MODEL, menuForPrompt, readAnswer, toApiMessages } from "./anthropic-ordering-assistant";

// The real service is never called here: `fetch` is a stand-in. What is checked is what we SEND and how we read the
// answer. Whether the service accepts it is only proven by a run with a real key (not done yet).

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;
let n = 0;
const ids = { newId: () => `id-${++n}` };
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const category = unwrap(createCategory(R, { name: { en: "Grill", ar: "مشاوي" }, sortOrder: 0 }, ids));
const item = (en: string, ar: string, priceFils: number) => unwrap(createMenuItem(category, { name: { en, ar }, description: { en: "", ar: "" }, priceFils, sortOrder: 0 }, ids));
const kebab = item("Kebab", "كباب", 4500);
const soldOut = unwrap(setItemSoldOut(item("Mansaf", "منسف", 9000), true));
const size = unwrap(createOptionGroup(R, { name: { en: "Size", ar: "الحجم" }, minSelect: 1, maxSelect: 1, sortOrder: 0 }, ids));
const large = unwrap(createOption(size, { name: { en: "Large", ar: "كبير" }, priceDeltaFils: 500, sortOrder: 0 }, ids));
const menu: PublicMenuSection[] = [{ category, items: [{ item: kebab, groups: [{ group: size, options: [large] }] }, { item: soldOut, groups: [] }] }];

const toolAnswer = (input: unknown, status = 200) =>
  new Response(JSON.stringify({ content: [{ type: "text", text: "..." }, { type: "tool_use", name: "reply_to_customer", input }] }), { status });
const history = [{ role: "customer" as const, text: "بدي كباب كبير" }];

describe("menuForPrompt", () => {
  it("gives the model ids, both-language names, prices in JD, availability and option rules", () => {
    const [section] = menuForPrompt(menu);
    expect(section?.items[0]).toMatchObject({
      menu_item_id: kebab.id,
      name: { en: "Kebab", ar: "كباب" },
      price_jd: "4.500",
      sold_out: false,
      option_groups: [{ min_select: 1, max_select: 1, options: [{ option_id: large.id, price_delta_jd: "0.500" }] }],
    });
    expect(section?.items[1]).toMatchObject({ sold_out: true });
  });
});

describe("toApiMessages", () => {
  it("starts with the customer and alternates, joining neighbours of the same kind", () => {
    expect(
      toApiMessages([
        { role: "assistant", text: "Welcome" },
        { role: "customer", text: "hi" },
        { role: "customer", text: "kebab?" },
        { role: "assistant", text: "yes" },
      ]),
    ).toEqual([
      { role: "user", content: "hi\nkebab?" },
      { role: "assistant", content: "yes" },
    ]);
  });
});

describe("readAnswer", () => {
  it("reads the tool call, and passes odd lines on for groundProposal to reject", () => {
    const answer = readAnswer([{ type: "tool_use", name: "reply_to_customer", input: { message: "Added", lines: [{ menu_item_id: "a", option_ids: ["b"], quantity: 2 }, "junk"] } }]);
    expect(answer?.message).toBe("Added");
    expect(answer?.proposed[0]).toEqual({ menuItemId: "a", optionIds: ["b"], quantity: 2 });
    expect(answer?.proposed).toHaveLength(2);
  });

  it("is nothing when the shape is wrong", () => {
    expect(readAnswer(undefined)).toBeNull();
    expect(readAnswer([{ type: "text", text: "hello" }])).toBeNull();
    expect(readAnswer([{ type: "tool_use", name: "other", input: { message: "x", lines: [] } }])).toBeNull();
    expect(readAnswer([{ type: "tool_use", name: "reply_to_customer", input: { message: 5, lines: [] } }])).toBeNull();
    expect(readAnswer([{ type: "tool_use", name: "reply_to_customer", input: { message: "x" } }])).toBeNull();
  });
});

describe("AnthropicOrderingAssistant", () => {
  it("is not available without a key, and calls nothing", async () => {
    const fetch = vi.fn();
    const assistant = new AnthropicOrderingAssistant({ apiKey: undefined, fetch });
    expect(assistant.isAvailable()).toBe(false);
    expect(await assistant.reply({ menu, history })).toEqual({ ok: false, error: { type: "NOT_CONFIGURED" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the menu and the chat with the key in a header only, forces the tool, and returns the suggestion", async () => {
    const fetch = vi.fn(async () => toolAnswer({ message: "تمام", lines: [{ menu_item_id: kebab.id, option_ids: [large.id], quantity: 1 }] }));
    const assistant = new AnthropicOrderingAssistant({ apiKey: "test-key", fetch });
    expect(assistant.isAvailable()).toBe(true);
    expect(await assistant.reply({ menu, history })).toEqual({
      ok: true,
      value: { message: "تمام", proposed: [{ menuItemId: kebab.id, optionIds: [large.id], quantity: 1 }] },
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "test-key", "anthropic-version": "2023-06-01" });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.tool_choice).toEqual({ type: "tool", name: "reply_to_customer" });
    expect(body.system).toContain("Never invent");
    expect(body.system).toContain(kebab.id); // the live menu is in the prompt
    expect(body.messages).toEqual([{ role: "user", content: "بدي كباب كبير" }]);
    expect(init.body as string).not.toContain("test-key");
  });

  it("uses the model it was given", async () => {
    const fetch = vi.fn(async () => toolAnswer({ message: "ok", lines: [] }));
    await new AnthropicOrderingAssistant({ apiKey: "k", model: "some-model", fetch }).reply({ menu, history });
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).model).toBe("some-model");
  });

  it("refuses an empty chat, a wrong-shaped answer, a failing service and an unreachable one", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const ask = (fetch: typeof globalThis.fetch, h = history) => new AnthropicOrderingAssistant({ apiKey: "k", fetch }).reply({ menu, history: h });
    expect(await ask(vi.fn(), [])).toEqual({ ok: false, error: { type: "BAD_ANSWER" } });
    expect(await ask(vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hi" }] }))))).toEqual({ ok: false, error: { type: "BAD_ANSWER" } });
    expect(await ask(vi.fn(async () => toolAnswer({}, 500)))).toEqual({ ok: false, error: { type: "SERVICE_FAILED" } });
    expect(await ask(vi.fn(async () => Promise.reject(new Error("offline"))))).toEqual({ ok: false, error: { type: "SERVICE_FAILED" } });
    quiet.mockRestore();
  });
});
