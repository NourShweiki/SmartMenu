import type { Page } from "@playwright/test";
import { t, type Locale } from "./demo";

/** Fills the "change my password" form (the page must be open) and sends it. */
export async function submitPasswordChange(page: Page, locale: Locale, current: string, next: string, repeat = next) {
  await page.getByLabel(t(locale, "Password.current"), { exact: true }).fill(current);
  await page.getByLabel(t(locale, "Password.next"), { exact: true }).fill(next);
  await page.getByLabel(t(locale, "Password.repeat"), { exact: true }).fill(repeat);
  await page.getByRole("button", { name: t(locale, "Password.submit"), exact: true }).click();
}

export const passwordError = (page: Page, locale: Locale, error: "wrong" | "tooShort" | "unchanged" | "mismatch") =>
  page.getByText(t(locale, `Password.errors.${error}`, { min: 10 }), { exact: true });
