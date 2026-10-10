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
    /** Seeded tables (supabase/seed.sql): labels in screen order, and one fixed demo QR token. */
    tables: { labels: ["1", "2", "Terrace"], token: "grill-table-1-demo-token-0001", dineIn: true },
    /** Customer-menu facts from the seed, with HAND-computed expectations (fils): 10% service, then 16% tax on subtotal + service. */
    menu: {
      simple: { en: "Hummus", ar: "حمص", fils: 1250, one: { sub: 1250, svc: 125, tax: 220, total: 1595 }, two: { sub: 2500, svc: 250, tax: 440, total: 3190 } },
      withOptions: {
        en: "Kebab", ar: "كباب", requiredChoice: true,
        choose: [{ en: "Large", ar: "كبير" }, { en: "Garlic sauce", ar: "ثومية" }], // (4.500 + 2.000 + 0.250) each
        quantity: 2, expected: { sub: 13500, svc: 1350, tax: 2376, total: 17226 },
      },
      soldOut: { en: "Shish tawook", ar: "شيش طاووق" },
      hiddenOrDeleted: "Test",
    },
  },
  coffee: {
    key: "coffee",
    origin: "http://demo-takeout.localhost:3000",
    name: { en: "Demo Coffee", ar: "قهوة التجربة" },
    owner: "owner@demo-takeout.test",
    waiter: null,
    cashier: null,
    toggleItem: "Cappuccino",
    /** Takeout only: dine-in is switched off, so its QR code is not active even though the table exists. */
    tables: { labels: ["A"], token: "coffee-table-a-demo-token-0001", dineIn: false },
    /** No service charge at Demo Coffee, 16% tax. */
    menu: {
      simple: { en: "Arabic coffee", ar: "قهوة عربية", fils: 1000, one: { sub: 1000, svc: 0, tax: 160, total: 1160 }, two: { sub: 2000, svc: 0, tax: 320, total: 2320 } },
      withOptions: {
        en: "Cappuccino", ar: "كابتشينو", requiredChoice: false,
        choose: [{ en: "Oat milk", ar: "حليب الشوفان" }], // 2.250 + 0.500
        quantity: 1, expected: { sub: 2750, svc: 0, tax: 440, total: 3190 },
      },
      soldOut: null,
      hiddenOrDeleted: null,
    },
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

/** Money as the screens show it: Western digits, three decimals, JD / د.أ (an independent check of the app's formatter). */
export const jd = (fils: number, locale: Locale) => `${(fils / 1000).toFixed(3)} ${locale === "en" ? "JD" : "د.أ"}`;
