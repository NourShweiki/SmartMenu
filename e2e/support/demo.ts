import { expect, type Page } from "@playwright/test";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

/**
 * The two demo restaurants from supabase/seed.sql. They must always be on the same phase (CLAUDE.md), so every
 * visible-screen test loops over BOTH, in /en and /ar. Local-only demo accounts: the password is in the seed file.
 */
export const PASSWORD = "smartmenu-demo-2026";

export type Locale = "en" | "ar";
export const LOCALES: Locale[] = ["en", "ar"];

export const SITES = {
  grill: {
    key: "grill",
    origin: "http://demo-dinein.localhost:3000",
    name: { en: "Demo Grill", ar: "مشاوي التجربة" },
    owner: "owner@demo-dinein.test",
    waiter: "waiter@demo-dinein.test",
    cashier: "cashier@demo-dinein.test",
    /** A seeded menu item (shown with both its names on the menu) that tests may toggle and put back. */
    toggleItem: "Hummus",
  },
  coffee: {
    key: "coffee",
    origin: "http://demo-takeout.localhost:3000",
    name: { en: "Demo Coffee", ar: "قهوة التجربة" },
    owner: "owner@demo-takeout.test",
    waiter: null,
    cashier: null,
    toggleItem: "Cappuccino",
  },
} as const;
export type Site = (typeof SITES)[keyof typeof SITES];
export const ALL_SITES: Site[] = [SITES.grill, SITES.coffee];

const MESSAGES = { en, ar } as const;

/** Text of a UI message in a language, straight from messages/<locale>.json (so tests follow the translations). */
export function t(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  let node: unknown = MESSAGES[locale];
  for (const part of key.split(".")) node = (node as Record<string, unknown>)?.[part];
  if (typeof node !== "string") throw new Error(`missing message ${locale}:${key}`);
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), node);
}

/** Opens the staff login of a restaurant and signs in. Lands on the staff dashboard. */
export async function signIn(page: Page, site: Site, email: string, locale: Locale) {
  await page.goto(`${site.origin}/${locale}/staff/login`);
  await page.getByLabel(t(locale, "StaffLogin.email")).fill(email);
  await page.getByLabel(t(locale, "StaffLogin.password")).fill(PASSWORD);
  await page.getByRole("button", { name: t(locale, "StaffLogin.submit") }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/staff$`));
}

/** The page is rendered in this language: <html lang dir> and the main heading agree. */
export async function expectLocale(page: Page, locale: Locale) {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
}
