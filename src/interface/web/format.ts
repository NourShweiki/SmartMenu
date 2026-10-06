import type { Fils } from "@/domain/shared/money";
import type { Locale } from "@/interface/web/i18n/locales";

// Western digits (0-9) in both languages (arabic-rtl skill); "-u-nu-latn" forces them even
// where the Arabic default would be Arabic-Indic digits (e.g. ar-JO).
const NUMBER_LOCALE: Record<Locale, string> = { ar: "ar-JO-u-nu-latn", en: "en-JO" };
const CURRENCY: Record<Locale, string> = { ar: "د.أ", en: "JD" };

const formatters = Object.fromEntries(
  (Object.keys(NUMBER_LOCALE) as Locale[]).map((l) => [
    l,
    new Intl.NumberFormat(NUMBER_LOCALE[l], { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
  ]),
) as Record<Locale, Intl.NumberFormat>;

/**
 * The ONE way to show money: 4500 fils -> "4.500 JD" / "4.500 د.أ".
 * Display only — never parse this back or do math on it. Wrap it in <bdi> inside Arabic text.
 */
export function formatPrice(fils: Fils, locale: Locale): string {
  return `${formatters[locale].format(fils / 1000)} ${CURRENCY[locale]}`;
}
