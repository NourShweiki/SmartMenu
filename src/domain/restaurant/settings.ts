import { err, ok, type Result } from "@/domain/shared/result";

export type Language = "ar" | "en";

/** Per-restaurant behaviour lives here, never in custom code (data-model skill §7). */
export type RestaurantSettings = {
  readonly dineInEnabled: boolean;
  readonly takeoutEnabled: boolean;
  readonly deliveryEnabled: boolean;
  /** Basis points: 1600 = 16%. */
  readonly taxRateBp: number;
  readonly serviceChargeBp: number;
  readonly defaultLanguage: Language;
  /**
   * The AI ordering chat for customers (PROJECT_SPEC.md §3.3, Nour 2026-11-27): OFF by default, for every new
   * restaurant and every preset; the owner switches it on in Settings. It is only offered when it is on AND the server
   * has an AI key. Its code stays whether it is on or off.
   */
  readonly assistantEnabled: boolean;
};

export type SettingsError =
  | { type: "NO_ORDER_MODE_ENABLED" }
  | { type: "INVALID_RATE"; field: "taxRateBp" | "serviceChargeBp" };

export type BusinessType = "dine-in" | "takeout";

/** Onboarding presets (spec §7). Jordan general sales tax is 16%. */
export function presetSettings(type: BusinessType): RestaurantSettings {
  return {
    dineInEnabled: type === "dine-in",
    takeoutEnabled: true,
    deliveryEnabled: false,
    taxRateBp: 1600,
    serviceChargeBp: type === "dine-in" ? 1000 : 0,
    defaultLanguage: "ar",
    assistantEnabled: false,
  };
}

const isValidBp = (n: number) => Number.isInteger(n) && n >= 0 && n <= 10_000;

export function validateSettings(s: RestaurantSettings): Result<RestaurantSettings, SettingsError> {
  if (!s.dineInEnabled && !s.takeoutEnabled && !s.deliveryEnabled) {
    return err({ type: "NO_ORDER_MODE_ENABLED" });
  }
  if (!isValidBp(s.taxRateBp)) return err({ type: "INVALID_RATE", field: "taxRateBp" });
  if (!isValidBp(s.serviceChargeBp)) return err({ type: "INVALID_RATE", field: "serviceChargeBp" });
  return ok(s);
}

/**
 * Is the AI ordering chat offered to this customer? Only when the owner switched it on (`assistantEnabled`, off by
 * default), the server has an AI key, and this customer can order here at all. Used by the home page, the menu page
 * and the chat's own server action, so a hand-made request cannot use a chat the owner switched off.
 */
export function offersOrderingAssistant(settings: Pick<RestaurantSettings, "assistantEnabled">, context: { aiKeyConfigured: boolean; canOrder: boolean }): boolean {
  return settings.assistantEnabled && context.aiKeyConfigured && context.canOrder;
}
