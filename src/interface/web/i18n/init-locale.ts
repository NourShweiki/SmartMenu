import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isLocale, type Locale } from "./locales";

/**
 * Call FIRST in every layout and page under app/[locale]. We don't run next-intl's
 * middleware, so this is how translations learn the locale; skipping it silently
 * falls back to Arabic. Unknown locales (/fr/...) become a 404.
 */
export async function initLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return locale;
}
