"use client";

import { useTranslations } from "next-intl";

/**
 * Screen-reader text for a loading skeleton. A client component on purpose: `loading.tsx` gets no
 * `params`, so it cannot call `initLocale`. Calling `getTranslations` there made next-intl resolve
 * (and cache for the whole request) the DEFAULT locale, so /en pages came out in Arabic. The text
 * comes from the layout's NextIntlClientProvider, which already knows the real locale.
 */
export function LoadingStatus() {
  const t = useTranslations("Common");
  return <span className="sr-only">{t("loading")}</span>;
}
