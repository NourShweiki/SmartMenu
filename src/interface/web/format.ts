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

// Times are the restaurant's wall clock (Asia/Amman, arabic-rtl skill), 24-hour so there is no AM/PM to translate
// or to flip in right-to-left text, with Western digits in both languages.
const timeFormatters = Object.fromEntries(
  (Object.keys(NUMBER_LOCALE) as Locale[]).map((l) => [
    l,
    new Intl.DateTimeFormat(NUMBER_LOCALE[l], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Amman" }),
  ]),
) as Record<Locale, Intl.DateTimeFormat>;

/** The ONE way to show a time of day: "19:45" in both languages. Wrap it in <bdi> inside Arabic text. */
export function formatTime(date: Date, locale: Locale): string {
  return timeFormatters[locale].format(date);
}

const dayTimeFormatters = Object.fromEntries(
  (Object.keys(NUMBER_LOCALE) as Locale[]).map((l) => [
    l,
    new Intl.DateTimeFormat(NUMBER_LOCALE[l], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Amman" }),
  ]),
) as Record<Locale, Intl.DateTimeFormat>;

/** A time of day WITH its day ("11 Oct, 19:45"), for things that may be from another day. Same clock and digits as `formatTime`. */
export function formatDayTime(date: Date, locale: Locale): string {
  return dayTimeFormatters[locale].format(date);
}

/**
 * The ONE way to show money: 4500 fils -> "4.500 JD" / "4.500 د.أ".
 * Display only — never parse this back or do math on it. Wrap it in <bdi> inside Arabic text.
 */
export function formatPrice(fils: Fils, locale: Locale): string {
  return `${formatters[locale].format(fils / 1000)} ${CURRENCY[locale]}`;
}
