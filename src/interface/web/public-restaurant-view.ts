import type { Branding } from "@/domain/restaurant/branding";
import { localized } from "@/domain/shared/localized";
import type { Locale } from "./i18n/locales";

/**
 * What the public restaurant page shows, decided in one place so it can be unit tested: each written
 * detail in the visitor's language (falling back to the other one), empty parts left out, and a phone link
 * that keeps only digits and "+" (so "(06) 555 0100" dials 065550100 and nothing else can end up in the link).
 */
export function publicDetails(branding: Branding, locale: Locale) {
  const tagline = localized(branding.tagline, locale);
  const about = localized(branding.about, locale);
  const address = localized(branding.address, locale);
  const hours = localized(branding.openingHours, locale);
  const phone = branding.phone.trim();
  const phoneHref = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;
  return {
    tagline,
    about,
    address,
    hours,
    phone,
    phoneHref,
    hasDetails: Boolean(about || address || phone || hours),
  };
}
