import { describe, expect, it, vi } from "vitest";
import type { PublicMenuSection } from "@/application/ports/public-menu-repository";
import { createCategory, createMenuItem } from "@/domain/menu/menu";
import type { RestaurantId } from "@/domain/restaurant/restaurant";
import { DEFAULT_MODEL, GeminiOrderingAssistant, readGeminiAnswer } from "./gemini-ordering-assistant";

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
const kebab = unwrap(createMenuItem(category, { name: { en: "Kebab", ar: "كباب" }, description: { en: "", ar: "" }, priceFils: 4500, sortOrder: 0 }, ids));
const menu: PublicMenuSection[] = [{ category, items: [{ item: kebab, groups: [] }] }];
const history = [{ role: "customer" as const, text: "بدي كباب" }];

const callAnswer = (args: unknown, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "reply_to_customer", args } }] } }] }), { status });

describe("readGeminiAnswer", () => {
  it("reads the function call", () => {
    expect(readGeminiAnswer({ candidates: [{ content: { parts: [{ functionCall: { name: "reply_to_customer", args: { message: "تمام", lines: [{ menu_item_id: "a", option_ids: [], quantity: 1 }] } } }] } }] })).toEqual({
      message: "تمام",
      proposed: [{ menuItemId: "a", optionIds: [], quantity: 1 }],
    });
  });

  it("is nothing when the shape is wrong, or the model only wrote text, or was blocked", () => {
    expect(readGeminiAnswer(null)).toBeNull();
    expect(readGeminiAnswer({})).toBeNull();
    expect(readGeminiAnswer({ candidates: [] })).toBeNull();
    expect(readGeminiAnswer({ candidates: [{ content: { parts: [{ text: "hello" }] } }] })).toBeNull();
    expect(readGeminiAnswer({ candidates: [{ content: { parts: [{ functionCall: { name: "other", args: { message: "x", lines: [] } } }] } }] })).toBeNull();
    expect(readGeminiAnswer({ candidates: [{ content: { parts: [{ functionCall: { name: "reply_to_customer", args: { lines: [] } } }] } }] })).toBeNull();
  });
});

describe("GeminiOrderingAssistant", () => {
  it("is not available without a key, and calls nothing", async () => {
    const fetch = vi.fn();
    const assistant = new GeminiOrderingAssistant({ apiKey: undefined, fetch });
    expect(assistant.isAvailable()).toBe(false);
    expect(await assistant.reply({ menu, history })).toEqual({ ok: false, error: { type: "NOT_CONFIGURED" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the menu and the chat with the key in a header only, forces the function, and returns the suggestion", async () => {
    const fetch = vi.fn(async () => callAnswer({ message: "تمام", lines: [{ menu_item_id: kebab.id, option_ids: [], quantity: 1 }] }));
    const assistant = new GeminiOrderingAssistant({ apiKey: "test-key", fetch });
    expect(assistant.isAvailable()).toBe(true);
    expect(await assistant.reply({ menu, history: [...history, { role: "assistant", text: "تمام" }, { role: "customer", text: "وكمان واحد" }] })).toEqual({
      ok: true,
      value: { message: "تمام", proposed: [{ menuItemId: kebab.id, optionIds: [], quantity: 1 }] },
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    expect(url).not.toContain("test-key"); // never in the URL, which logs keep
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key" });
    const body = JSON.parse(init.body as string);
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["reply_to_customer"] } });
    expect(body.systemInstruction.parts[0].text).toContain("Never invent");
    expect(body.systemInstruction.parts[0].text).toContain(kebab.id); // the live menu is in the prompt
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    expect(body.tools[0].functionDeclarations[0].name).toBe("reply_to_customer");
    expect(init.body as string).not.toContain("test-key");
  });

  it("can be pointed at another address (a proxy, or the stand-in of the browser tests)", async () => {
    const fetch = vi.fn(async () => callAnswer({ message: "ok", lines: [] }));
    await new GeminiOrderingAssistant({ apiKey: "k", baseUrl: "http://127.0.0.1:3199/v1beta/models", fetch }).reply({ menu, history });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(`http://127.0.0.1:3199/v1beta/models/${DEFAULT_MODEL}:generateContent`);
  });

  it("uses the model it was given", async () => {
    const fetch = vi.fn(async () => callAnswer({ message: "ok", lines: [] }));
    await new GeminiOrderingAssistant({ apiKey: "k", model: "some-model", fetch }).reply({ menu, history });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain("/models/some-model:generateContent");
  });

  it("tries once more when the service is overloaded (503), and not for other errors", async () => {
    const answer = () => callAnswer({ message: "تمام", lines: [] });
    const fetch = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(answer());
    const result = await new GeminiOrderingAssistant({ apiKey: "k", fetch, retryDelayMs: 0 }).reply({ menu, history });
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);

    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const stillBusy = vi.fn(async () => new Response("busy", { status: 503 }));
    expect(await new GeminiOrderingAssistant({ apiKey: "k", fetch: stillBusy, retryDelayMs: 0 }).reply({ menu, history })).toEqual({ ok: false, error: { type: "SERVICE_FAILED" } });
    expect(stillBusy).toHaveBeenCalledTimes(2); // one retry, not a loop
    // A 429 means the quota is used up (maybe for the day): a second try would only spend another request.
    for (const status of [429, 500]) {
      const failing = vi.fn(async () => new Response("no", { status }));
      await new GeminiOrderingAssistant({ apiKey: "k", fetch: failing, retryDelayMs: 0 }).reply({ menu, history });
      expect(failing).toHaveBeenCalledTimes(1);
    }
    quiet.mockRestore();
  });

  it("skips the retry when too little of the deadline is left to be useful", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const busy = vi.fn(async () => new Response("busy", { status: 503 }));
    await new GeminiOrderingAssistant({ apiKey: "k", fetch: busy, retryDelayMs: 44_000 }).reply({ menu, history }); // 45 s deadline: 1 s left after the pause
    expect(busy).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });

  it("answers a plain question even when the model left the empty 'lines' out", async () => {
    const fetch = vi.fn(async () => callAnswer({ message: "We have kebab." }));
    expect(await new GeminiOrderingAssistant({ apiKey: "k", fetch }).reply({ menu, history })).toEqual({ ok: true, value: { message: "We have kebab.", proposed: [] } });
  });

  it("gives every attempt a timeout, so a hung call cannot keep a customer waiting for ever", async () => {
    const fetch = vi.fn(async () => callAnswer({ message: "ok", lines: [] }));
    await new GeminiOrderingAssistant({ apiKey: "k", fetch }).reply({ menu, history });
    expect(((fetch.mock.calls[0] as unknown as [string, RequestInit])[1]).signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses an empty chat, a wrong-shaped answer, a failing service and an unreachable one", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const ask = (fetch: typeof globalThis.fetch, h = history) => new GeminiOrderingAssistant({ apiKey: "k", fetch }).reply({ menu, history: h });
    expect(await ask(vi.fn(), [])).toEqual({ ok: false, error: { type: "BAD_ANSWER" } });
    expect(await ask(vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }))))).toEqual({ ok: false, error: { type: "BAD_ANSWER" } });
    expect(await ask(vi.fn(async () => callAnswer({}, 500)))).toEqual({ ok: false, error: { type: "SERVICE_FAILED" } });
    expect(await ask(vi.fn(async () => Promise.reject(new Error("offline"))))).toEqual({ ok: false, error: { type: "SERVICE_FAILED" } });
    quiet.mockRestore();
  });
});
