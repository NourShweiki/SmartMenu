import { err, ok, type LocalizedText, type Result } from "@/domain/shared/result";
import { presetSettings, validateSettings, type BusinessType, type RestaurantSettings, type SettingsError } from "./settings";

export type RestaurantId = string & { readonly __brand: "RestaurantId" };

export type Restaurant = {
  readonly id: RestaurantId;
  /** Used for the subdomain: <slug>.ourapp.com */
  readonly slug: string;
  readonly name: LocalizedText;
  readonly settings: RestaurantSettings;
  readonly createdAt: Date;
};

export type RestaurantError =
  | { type: "INVALID_SLUG"; reason: "FORMAT" | "RESERVED" }
  | { type: "NAME_REQUIRED"; lang: "en" | "ar" }
  | SettingsError;

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/; // 3–40 chars, no leading/trailing hyphen
const RESERVED_SLUGS = new Set(["www", "api", "app", "admin", "dashboard", "static", "mail", "setup", "help", "status"]);

export function validateSlug(slug: string): Result<string, RestaurantError> {
  if (!SLUG_PATTERN.test(slug) || slug.includes("--")) return err({ type: "INVALID_SLUG", reason: "FORMAT" });
  if (RESERVED_SLUGS.has(slug)) return err({ type: "INVALID_SLUG", reason: "RESERVED" });
  return ok(slug);
}

export type CreateRestaurantInput = {
  slug: string;
  name: LocalizedText;
  businessType: BusinessType;
};

/** Ids and time are injected so the domain stays pure and testable. */
export type RestaurantDeps = { newId: () => string; now: () => Date };

export function createRestaurant(input: CreateRestaurantInput, deps: RestaurantDeps): Result<Restaurant, RestaurantError> {
  const slug = input.slug.trim().toLowerCase();
  const slugResult = validateSlug(slug);
  if (!slugResult.ok) return slugResult;

  const name = { en: input.name.en.trim(), ar: input.name.ar.trim() };
  if (!name.en) return err({ type: "NAME_REQUIRED", lang: "en" });
  if (!name.ar) return err({ type: "NAME_REQUIRED", lang: "ar" });

  const settings = validateSettings(presetSettings(input.businessType));
  if (!settings.ok) return settings;

  return ok({
    id: deps.newId() as RestaurantId,
    slug,
    name,
    settings: settings.value,
    createdAt: deps.now(),
  });
}

export function updateSettings(r: Restaurant, next: RestaurantSettings): Result<Restaurant, RestaurantError> {
  const v = validateSettings(next);
  return v.ok ? ok({ ...r, settings: v.value }) : v;
}
