import { describe, expect, it } from "vitest";
import { previewCookieOptions, previewTarget } from "./preview-link-model";

describe("previewTarget (where a preview link /r/<slug>/<path> may send the visitor)", () => {
  it("opens the restaurant's home page in its default language when no path is given", () => {
    expect(previewTarget(undefined, "ar")).toBe("/ar");
    expect(previewTarget([], "en")).toBe("/en");
  });

  it("opens customer pages, staff pages and table QR codes", () => {
    expect(previewTarget(["ar", "menu"], "en")).toBe("/ar/menu");
    expect(previewTarget(["en", "staff", "login"], "ar")).toBe("/en/staff/login");
    expect(previewTarget(["en", "staff", "menu", "items", "ab65f80e-6ebc-463f-b40c-51fa21945028", "edit"], "ar")).toBe(
      "/en/staff/menu/items/ab65f80e-6ebc-463f-b40c-51fa21945028/edit",
    );
    expect(previewTarget(["t", "Xy3_-abcDEF123"], "ar")).toBe("/t/Xy3_-abcDEF123");
  });

  it("never leaves this site or reaches another kind of page (no open redirect)", () => {
    const refused: string[][] = [
      ["fr", "menu"], // unknown language
      ["setup"], // the founders' tool is not a restaurant page
      ["r", "demo-dinein"], // no loops
      ["en", ".."],
      ["en", ""],
      ["en", "a.b"],
      ["", "evil.example"],
      ["https:", "", "evil.example"],
      ["en", "%2F%2Fevil.example"],
      ["en", "x?y=1"],
      ["en", "a b"],
      ["en", "x".repeat(101)],
      ["en", "1", "2", "3", "4", "5", "6", "7", "8"], // too deep
    ];
    for (const rest of refused) expect(previewTarget(rest, "en"), JSON.stringify(rest)).toBeNull();
  });

  it("keeps the cookie server-only and same-site, Secure on https", () => {
    expect(previewCookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(previewCookieOptions(false).secure).toBe(false);
  });
});
