import type { Language } from "@/domain/restaurant/settings";

/** UI locales = the restaurant languages. Arabic is the default (spec §5). */
export type Locale = Language;
export const LOCALES: readonly Locale[] = ["ar", "en"];
export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export const dirOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");
export const otherLocale = (locale: Locale): Locale => (locale === "ar" ? "en" : "ar");
