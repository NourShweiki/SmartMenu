import { describe, expect, it, vi } from "vitest";
import { AnthropicMenuDraftGateway, DEFAULT_MODEL, extractCsv } from "./anthropic-menu-draft-gateway";

// The real service is never called here: `fetch` is a stand-in. What is checked is what we SEND and how we read the
// answer. Whether the service accepts it is only proven by a run with a real key (not done yet).

const HEADER = "category_en,category_ar,name_en,name_ar,description_en,description_ar,price";
const CSV = `${HEADER}\nStarters,المقبلات,Hummus,حمص,,,1.250`;
const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mediaType: "image/jpeg" as const };
const answer = (text: string, status = 200) => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status });

describe("extractCsv", () => {
  it("takes the CSV out of whatever is around it", () => {
    expect(extractCsv(CSV)).toBe(CSV);
    expect(extractCsv("Here is the menu:\n```csv\n" + CSV + "\n```")).toBe(CSV);
  });

  it("is nothing when there is no header, or only the header (not a menu)", () => {
    expect(extractCsv("I cannot read this image.")).toBeNull();
    expect(extractCsv(HEADER)).toBeNull();
    expect(extractCsv(`${HEADER}\n\n`)).toBeNull();
  });
});

describe("AnthropicMenuDraftGateway", () => {
  it("is not available without a key, and calls nothing", async () => {
    const fetch = vi.fn();
    const gateway = new AnthropicMenuDraftGateway({ apiKey: undefined, fetch });
    expect(gateway.isAvailable()).toBe(false);
    expect(await gateway.draft(photo)).toEqual({ ok: false, error: { type: "NOT_CONFIGURED" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the photo with the key in a header and returns the CSV", async () => {
    const fetch = vi.fn(async () => answer(CSV));
    const gateway = new AnthropicMenuDraftGateway({ apiKey: "test-key", fetch });
    expect(gateway.isAvailable()).toBe(true);
    expect(await gateway.draft(photo)).toEqual({ ok: true, value: CSV });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "test-key", "anthropic-version": "2023-06-01" });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(String.fromCharCode(...photo.bytes)) } });
    expect(body.messages[0].content[1].text).toContain("Never invent");
    expect(init.body as string).not.toContain("test-key"); // the key travels in the header only
  });

  it("sends a PDF as a document, and uses the model it was given", async () => {
    const fetch = vi.fn(async () => answer(CSV));
    const pdf = { bytes: new TextEncoder().encode("%PDF-1.7 ..."), mediaType: "application/pdf" as const };
    await new AnthropicMenuDraftGateway({ apiKey: "k", model: "some-model", fetch }).draft(pdf);
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("some-model");
    expect(body.messages[0].content[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf" } });
  });

  it("says so when the answer is not a menu, and when the service fails or cannot be reached", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const gateway = (fetch: typeof globalThis.fetch) => new AnthropicMenuDraftGateway({ apiKey: "k", fetch });
    expect(await gateway(async () => answer("This is a photo of a cat.")).draft(photo)).toEqual({ ok: false, error: { type: "NOTHING_FOUND" } });
    expect(await gateway(async () => answer("rate limited", 429)).draft(photo)).toEqual({ ok: false, error: { type: "SERVICE_FAILED" } });
    expect(await gateway(async () => new Response("not json", { status: 200 })).draft(photo)).toEqual({ ok: false, error: { type: "NOTHING_FOUND" } });
    expect(
      await gateway(async () => {
        throw new Error("network down");
      }).draft(photo),
    ).toEqual({ ok: false, error: { type: "SERVICE_FAILED" } });
    quiet.mockRestore();
  });
});
