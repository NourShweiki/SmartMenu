import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrPath } from "./qr";
import { tableScanUrl } from "./scan-url";

describe("tableScanUrl", () => {
  it("carries only the token: no table number and no language", () => {
    expect(tableScanUrl("https://grill.ourapp.com", "k9x2Qe7LmP0aBcDeFgHiJk")).toBe("https://grill.ourapp.com/t/k9x2Qe7LmP0aBcDeFgHiJk");
    expect(tableScanUrl("http://demo-dinein.localhost:3000", "tok")).toBe("http://demo-dinein.localhost:3000/t/tok");
  });
});

describe("qrPath", () => {
  it("draws a square grid with dark modules for a link (QR version 1 is 21x21)", () => {
    const { size, path } = qrPath("https://a.co/t/x");
    expect(size).toBeGreaterThanOrEqual(21);
    expect(path.length).toBeGreaterThan(100);
    expect(path).toMatch(/^M\d+ \d+h1v1h-1z/); // one 1x1 square per dark module
    // The three finder squares: top-left, top-right and bottom-left corners are always dark.
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1]] as const) expect(path).toContain(`M${x} ${y}h1v1h-1z`);
  });

  it("is deterministic and differs between links", () => {
    expect(qrPath("https://a.co/t/one")).toEqual(qrPath("https://a.co/t/one"));
    expect(qrPath("https://a.co/t/one").path).not.toBe(qrPath("https://a.co/t/two").path);
  });

  it("handles a realistic table link with a 24-character token", () => {
    const link = "https://demo-dinein.example.com/t/AbCdEfGhIjKlMnOpQrStUvWx";
    expect(qrPath(link).size).toBeLessThanOrEqual(41); // stays small enough to print and scan easily
  });
});

// The real test of a QR code: can a scanner read it? Render exactly what the page draws (the path plus the
// 2-module blank border) into pixels and decode it with an independent QR reader.
describe("a printed code can be read by a scanner", () => {
  function decode(text: string, moduleSize = 6): string | null {
    const { size, path } = qrPath(text);
    const quiet = 2;
    const side = (size + quiet * 2) * moduleSize;
    const pixels = new Uint8ClampedArray(side * side * 4).fill(255); // white, opaque
    for (const [, x, y] of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      for (let dy = 0; dy < moduleSize; dy++) {
        for (let dx = 0; dx < moduleSize; dx++) {
          const i = (((Number(y) + quiet) * moduleSize + dy) * side + (Number(x) + quiet) * moduleSize + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0; // black module
        }
      }
    }
    return jsQR(pixels, side, side)?.data ?? null;
  }

  it("decodes back to exactly the link that was encoded", () => {
    for (const link of [
      "http://demo-dinein.localhost:3000/t/grill-table-1-demo-token-0001",
      "https://grill.ourapp.com/t/AbCdEfGhIjKlMnOpQrStUvWx",
      "https://a-long-restaurant-name.example.com/t/9f8e7d6c5b4a39281716ABCDefgh_-12",
    ]) {
      expect(decode(link), link).toBe(link);
    }
  });
});
