import { describe, expect, it } from "vitest";
import { distinctReasons, MAX_CLIENT_TURNS, toHistory, type ChatEntry } from "./assistant-chat-model";

describe("toHistory", () => {
  it("sends the customer's and the assistant's turns, never the app's own notes", () => {
    const entries: ChatEntry[] = [
      { role: "customer", text: "hi" },
      { role: "assistant", text: "hello" },
      { role: "note", text: "1 item added to your cart." },
      { role: "customer", text: "two tea" },
    ];
    expect(toHistory(entries)).toEqual([
      { role: "customer", text: "hi" },
      { role: "assistant", text: "hello" },
      { role: "customer", text: "two tea" },
    ]);
  });

  it("keeps only the most recent turns", () => {
    const entries: ChatEntry[] = Array.from({ length: MAX_CLIENT_TURNS + 5 }, (_, i) => ({ role: "customer", text: String(i) }));
    const sent = toHistory(entries);
    expect(sent).toHaveLength(MAX_CLIENT_TURNS);
    expect(sent[0]?.text).toBe("5");
  });
});

describe("distinctReasons", () => {
  it("lists each reason once, in the order first seen", () => {
    expect(distinctReasons(["UNKNOWN_ITEM", "ITEM_UNAVAILABLE", "UNKNOWN_ITEM"])).toEqual(["UNKNOWN_ITEM", "ITEM_UNAVAILABLE"]);
    expect(distinctReasons([])).toEqual([]);
  });
});
