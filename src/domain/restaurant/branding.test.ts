import { describe, expect, it } from "vitest";
import type { RestaurantId } from "./restaurant";
import {
  ACCENT_COLORS,
  accentHex,
  BRANDING_LIMITS,
  brandingFromJson,
  brandingToJson,
  DEFAULT_ACCENT,
  DEFAULT_BRANDING,
  logoPath,
  MAX_LOGO_BYTES,
  setLogo,
  updateBranding,
  validateLogo,
  validatePhone,
  type BrandingInput,
} from "./branding";

const R = "11111111-1111-4000-8000-000000000001" as RestaurantId;

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(bl!);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const input = (over: Partial<BrandingInput> = {}): BrandingInput => ({
  name: { en: "Demo Grill", ar: "مشاوي التجربة" },
  accent: "teal",
  tagline: { en: "Charcoal grills", ar: "مشاوي على الفحم" },
  about: { en: "", ar: "" },
  address: { en: "Amman, Rainbow St.", ar: "عمّان، شارع الرينبو" },
  phone: "+962 6 555 0100",
  openingHours: { en: "Daily 12:00 - 23:00", ar: "يوميًا ١٢:٠٠ - ٢٣:٠٠" },
  ...over,
});
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe("accent palette", () => {
  it("has 8 colours with unique ids and valid hex values", () => {
    expect(ACCENT_COLORS).toHaveLength(8);
    expect(new Set(ACCENT_COLORS.map((c) => c.id)).size).toBe(8);
    for (const c of ACCENT_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(accentHex(DEFAULT_ACCENT)).toBe("#1f2937");
  });

  it("every colour is readable with white text on top (WCAG AA, contrast >= 4.5)", () => {
    for (const c of ACCENT_COLORS) expect(contrast(c.hex, "#ffffff"), c.id).toBeGreaterThanOrEqual(4.5);
  });
});

describe("updateBranding", () => {
  it("accepts good input, trims it, and keeps the current logo", () => {
    const current = setLogo(DEFAULT_BRANDING, `${R}/logo-1.png`);
    const { name, branding } = unwrap(
      updateBranding(current, input({ tagline: { en: "  Charcoal grills  ", ar: "" }, phone: " +962 6 555 0100 " })),
    );
    expect(name).toEqual({ en: "Demo Grill", ar: "مشاوي التجربة" });
    expect(branding).toMatchObject({
      accent: "teal",
      logoPath: `${R}/logo-1.png`,
      tagline: { en: "Charcoal grills", ar: "" },
      phone: "+962 6 555 0100",
    });
  });

  it("allows every written detail to be empty (cleared)", () => {
    const empty = { en: "", ar: "" };
    const { branding } = unwrap(
      updateBranding(DEFAULT_BRANDING, input({ tagline: empty, about: empty, address: empty, phone: "", openingHours: empty })),
    );
    expect(branding).toMatchObject({ tagline: empty, about: empty, address: empty, phone: "", openingHours: empty });
  });

  it("requires both names (the restaurant name is shown to customers)", () => {
    expect(updateBranding(DEFAULT_BRANDING, input({ name: { en: " ", ar: "س" } }))).toEqual({
      ok: false,
      error: { type: "NAME_REQUIRED", lang: "en" },
    });
    expect(updateBranding(DEFAULT_BRANDING, input({ name: { en: "A", ar: "" } }))).toEqual({
      ok: false,
      error: { type: "NAME_REQUIRED", lang: "ar" },
    });
    expect(updateBranding(DEFAULT_BRANDING, input({ name: { en: "x".repeat(81), ar: "س" } }))).toEqual({
      ok: false,
      error: { type: "NAME_TOO_LONG", lang: "en" },
    });
  });

  it("only accepts a colour from the palette", () => {
    for (const accent of ["#ff0000", "hotpink", "", "RED", "teal "]) {
      expect(updateBranding(DEFAULT_BRANDING, input({ accent }))).toEqual({ ok: false, error: { type: "INVALID_ACCENT" } });
    }
    for (const c of ACCENT_COLORS) expect(updateBranding(DEFAULT_BRANDING, input({ accent: c.id })).ok).toBe(true);
  });

  it("limits each written detail per language", () => {
    for (const field of Object.keys(BRANDING_LIMITS) as (keyof typeof BRANDING_LIMITS)[]) {
      const max = BRANDING_LIMITS[field];
      expect(updateBranding(DEFAULT_BRANDING, input({ [field]: { en: "x".repeat(max), ar: "" } })).ok).toBe(true);
      expect(updateBranding(DEFAULT_BRANDING, input({ [field]: { en: "", ar: "ع".repeat(max + 1) } }))).toEqual({
        ok: false,
        error: { type: "TEXT_TOO_LONG", field, lang: "ar", max },
      });
    }
  });
});

describe("validatePhone", () => {
  it("accepts international numbers in common formats and an empty value", () => {
    for (const ok of ["", "  ", "+962 6 555 0100", "+962-6-555-0100", "(06) 555 0100", "0795551234", "+96279555123"]) {
      expect(validatePhone(ok).ok, ok).toBe(true);
    }
    expect(validatePhone(" +962 6 555 0100 ")).toEqual({ ok: true, value: "+962 6 555 0100" });
  });

  it("rejects letters, too few or too many digits, and misplaced symbols", () => {
    for (const bad of ["call us", "1234", "+1234567890123456", "12-ab-34567", "++962795551234", "962+795551234", "<script>"]) {
      expect(validatePhone(bad), bad).toEqual({ ok: false, error: { type: "INVALID_PHONE" } });
    }
  });
});

describe("logo", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");

  it("accepts PNG / JPEG up to 2 MB, decided by the file's bytes", () => {
    expect(validateLogo({ head: png, sizeBytes: 1000 })).toEqual({ ok: true, value: { contentType: "image/png", extension: "png" } });
    expect(validateLogo({ head: jpeg, sizeBytes: MAX_LOGO_BYTES })).toMatchObject({ ok: true });
  });

  it("rejects empty, too large, and anything that is not a raster image (SVG can carry scripts)", () => {
    expect(validateLogo({ head: png, sizeBytes: 0 })).toEqual({ ok: false, error: { type: "PHOTO_EMPTY" } });
    expect(validateLogo({ head: png, sizeBytes: MAX_LOGO_BYTES + 1 })).toEqual({ ok: false, error: { type: "PHOTO_TOO_LARGE" } });
    expect(validateLogo({ head: svg, sizeBytes: 100 })).toEqual({ ok: false, error: { type: "PHOTO_TYPE_NOT_ALLOWED" } });
  });

  it("builds a path that starts with the restaurant id (the storage rule keys on it)", () => {
    const path = logoPath(R, "abc", { contentType: "image/png", extension: "png" });
    expect(path).toBe(`${R}/logo-abc.png`);
    expect(path.startsWith(`${R}/`)).toBe(true);
  });
});

describe("branding <-> json", () => {
  it("round-trips", () => {
    const branding = setLogo(unwrap(updateBranding(DEFAULT_BRANDING, input())).branding, `${R}/logo-1.webp`);
    expect(brandingFromJson(brandingToJson(branding))).toEqual(branding);
  });

  it("falls back to defaults for empty, missing or odd stored values (never throws)", () => {
    expect(brandingFromJson({})).toEqual(DEFAULT_BRANDING);
    for (const odd of [null, undefined, "x", 5, [], [1, 2]]) expect(brandingFromJson(odd)).toEqual(DEFAULT_BRANDING);
    expect(brandingFromJson({ accent: "chartreuse", logoPath: 7, tagline: "no", phone: 5, about: { en: 1, ar: "س" } })).toEqual({
      ...DEFAULT_BRANDING,
      about: { en: "", ar: "س" },
    });
    expect(brandingFromJson({ logoPath: "" }).logoPath).toBeNull();
  });
});
