import type { Language } from "@/domain/restaurant/settings";

/**
 * The link inside the counter's QR sign (PROJECT_SPEC.md §3.3, coffee shops): the restaurant's menu, in its default
 * customer language, on the address in use (`origin` from `getScanOrigin`, which adds `/r/<slug>` on a preview link).
 * The language is in the path because a preview link only accepts `/ar/...` and `/en/...`; the customer can still
 * switch language on the page, and a later change of the default language does not break a printed sign.
 */
export const counterMenuUrl = (origin: string, language: Language): string => `${origin}/${language}/menu`;

/**
 * Who sees the "QR sign for the counter": whoever prints table codes (tables:manage: owner, manager), at a restaurant
 * that takes takeout orders (the sign is how a walk-in customer orders on their own phone).
 */
export const offersCounterSign = (settings: { readonly takeoutEnabled: boolean }, mayPrintCodes: boolean): boolean =>
  settings.takeoutEnabled && mayPrintCodes;
