import { validateName } from "@/domain/menu/menu";
import { detectPhotoType, type PhotoError, type PhotoType } from "@/domain/menu/photo";
import { err, ok, type LocalizedText, type Result } from "@/domain/shared/result";
import type { RestaurantId } from "./restaurant";

/**
 * Restaurant branding: a CONSTRAINED set of things the owner may change (decided with Nour 2026-10-10,
 * spec §5): a logo, ONE accent colour from a fixed palette, and written details. No free colour picker,
 * fonts, layouts or custom CSS: "configure, don't customise" (spec §7). Stored in
 * `restaurant_settings.branding` (jsonb) and, for the restaurant name, in `restaurants`.
 */

// ─── Accent colour ──────────────────────────────────────────────────────

/**
 * Every colour is dark enough for WHITE text on top of it (contrast >= 4.5:1, WCAG AA; checked in the unit
 * test), so a banner or button in the accent colour is always readable, whatever the owner picks.
 */
export const ACCENT_COLORS = [
  { id: "charcoal", hex: "#1f2937" },
  { id: "red", hex: "#b91c1c" },
  { id: "orange", hex: "#c2410c" },
  { id: "green", hex: "#15803d" },
  { id: "teal", hex: "#0f766e" },
  { id: "blue", hex: "#1d4ed8" },
  { id: "purple", hex: "#7e22ce" },
  { id: "pink", hex: "#be185d" },
] as const;
export type AccentColorId = (typeof ACCENT_COLORS)[number]["id"];
export const DEFAULT_ACCENT: AccentColorId = "charcoal";

export const isAccentColor = (value: unknown): value is AccentColorId => ACCENT_COLORS.some((c) => c.id === value);
export const accentHex = (id: AccentColorId): string => ACCENT_COLORS.find((c) => c.id === id)!.hex;

// ─── Shape ──────────────────────────────────────────────────────────────

export type Branding = {
  readonly accent: AccentColorId;
  /** Storage path of the logo ("<restaurantId>/logo-<id>.<ext>"), or null. */
  readonly logoPath: string | null;
  /** One line under the name, e.g. "Charcoal grills since 1998". */
  readonly tagline: LocalizedText;
  /** A short paragraph about the restaurant. */
  readonly about: LocalizedText;
  readonly address: LocalizedText;
  /** International format as typed by the owner, e.g. "+962 6 555 0100". Empty = not shown. */
  readonly phone: string;
  /** Free text, e.g. "Daily 12:00 - 23:00". */
  readonly openingHours: LocalizedText;
};

const EMPTY: LocalizedText = { en: "", ar: "" };
export const DEFAULT_BRANDING: Branding = {
  accent: DEFAULT_ACCENT,
  logoPath: null,
  tagline: EMPTY,
  about: EMPTY,
  address: EMPTY,
  phone: "",
  openingHours: EMPTY,
};

export const BRANDING_LIMITS = { tagline: 80, about: 500, address: 200, openingHours: 300 } as const;
export type BrandingTextField = keyof typeof BRANDING_LIMITS;

export type BrandingError =
  | { type: "NAME_REQUIRED"; lang: "en" | "ar" }
  | { type: "NAME_TOO_LONG"; lang: "en" | "ar" }
  | { type: "INVALID_ACCENT" }
  | { type: "TEXT_TOO_LONG"; field: BrandingTextField; lang: "en" | "ar"; max: number }
  | { type: "INVALID_PHONE" };

// ─── Editing the written details + colour (the logo has its own functions below) ──

export type BrandingInput = {
  /** The restaurant's own name, both languages (stored on `restaurants`). */
  name: LocalizedText;
  accent: string;
  tagline: LocalizedText;
  about: LocalizedText;
  address: LocalizedText;
  phone: string;
  openingHours: LocalizedText;
};

/** Optional phone: 5-15 digits (E.164 allows 15), may start with "+" and contain spaces, dashes, brackets. */
export function validatePhone(raw: string): Result<string, BrandingError> {
  const phone = raw.trim();
  if (phone === "") return ok("");
  const digits = phone.replace(/\D/g, "").length;
  if (!/^\+?\(?[0-9][0-9 ()-]*$/.test(phone) || digits < 5 || digits > 15) return err({ type: "INVALID_PHONE" });
  return ok(phone);
}

function validateText(field: BrandingTextField, text: LocalizedText): Result<LocalizedText, BrandingError> {
  const max = BRANDING_LIMITS[field];
  const clean = { en: text.en.trim(), ar: text.ar.trim() };
  for (const lang of ["en", "ar"] as const) {
    if (clean[lang].length > max) return err({ type: "TEXT_TOO_LONG", field, lang, max });
  }
  return ok(clean);
}

/**
 * Checks what the owner typed and returns the new name + branding. The logo is carried over untouched
 * (it changes only through setLogo / removeLogo, which also move the file).
 */
export function updateBranding(
  current: Branding,
  input: BrandingInput,
): Result<{ name: LocalizedText; branding: Branding }, BrandingError> {
  const name = validateName(input.name);
  if (!name.ok) return err(name.error as BrandingError);
  if (!isAccentColor(input.accent)) return err({ type: "INVALID_ACCENT" });
  const phone = validatePhone(input.phone);
  if (!phone.ok) return phone;

  const tagline = validateText("tagline", input.tagline);
  if (!tagline.ok) return tagline;
  const about = validateText("about", input.about);
  if (!about.ok) return about;
  const address = validateText("address", input.address);
  if (!address.ok) return address;
  const openingHours = validateText("openingHours", input.openingHours);
  if (!openingHours.ok) return openingHours;

  return ok({
    name: name.value,
    branding: {
      accent: input.accent,
      logoPath: current.logoPath,
      tagline: tagline.value,
      about: about.value,
      address: address.value,
      phone: phone.value,
      openingHours: openingHours.value,
    },
  });
}

// ─── Logo ───────────────────────────────────────────────────────────────

/** A logo is small: JPG / PNG / WebP up to 2 MB. (SVG is NOT allowed: it can carry scripts.) */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Same checks as menu photos (type decided from the file's first bytes), with the logo's own size limit. */
export function validateLogo(file: { head: Uint8Array; sizeBytes: number }): Result<PhotoType, PhotoError> {
  if (file.sizeBytes <= 0) return err({ type: "PHOTO_EMPTY" });
  if (file.sizeBytes > MAX_LOGO_BYTES) return err({ type: "PHOTO_TOO_LARGE" });
  const type = detectPhotoType(file.head);
  return type ? ok(type) : err({ type: "PHOTO_TYPE_NOT_ALLOWED" });
}

/**
 * Storage path "<restaurantId>/logo-<fileId>.<ext>". The first folder MUST be the restaurant id: the storage
 * rules use it to decide who may write. A fresh fileId per upload means a replaced logo is never served stale.
 */
export function logoPath(restaurantId: RestaurantId, fileId: string, type: PhotoType): string {
  return `${restaurantId}/logo-${fileId}.${type.extension}`;
}

export const setLogo = (branding: Branding, path: string | null): Branding => ({ ...branding, logoPath: path });

// ─── jsonb <-> Branding ─────────────────────────────────────────────────

export function brandingToJson(b: Branding): Record<string, unknown> {
  return {
    accent: b.accent,
    logoPath: b.logoPath,
    tagline: b.tagline,
    about: b.about,
    address: b.address,
    phone: b.phone,
    openingHours: b.openingHours,
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const localizedFrom = (v: unknown): LocalizedText => {
  const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  return { en: str(o.en), ar: str(o.ar) };
};

/** Reads stored branding defensively: missing or odd values fall back to the defaults, never throw. */
export function brandingFromJson(json: unknown): Branding {
  const o = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  return {
    accent: isAccentColor(o.accent) ? o.accent : DEFAULT_ACCENT,
    logoPath: typeof o.logoPath === "string" && o.logoPath !== "" ? o.logoPath : null,
    tagline: localizedFrom(o.tagline),
    about: localizedFrom(o.about),
    address: localizedFrom(o.address),
    phone: str(o.phone),
    openingHours: localizedFrom(o.openingHours),
  };
}
