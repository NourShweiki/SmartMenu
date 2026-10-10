import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { signIn, t, type Locale, type Site } from "./demo";

// Shared steps for specs that need a table: the owner adds one on the tables screen (labelled "E2E ..."), a guest
// scans its link, and the table is deleted again (soft delete) at the end.

export const tableLabel = () => `E2E ${Math.floor(100 + Math.random() * 900)}`;
/** Signs the owner in and opens the tables screen. */
export const openTables = async (page: Page, site: Site, locale: Locale) => {
  await signIn(page, site, site.owner, locale);
  await page.goto(`${site.origin}/${locale}/staff/tables`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Tables.title"));
  page.on("dialog", (dialog) => dialog.accept()); // "are you sure?" questions
};
export const tableRow = (page: Page, locale: Locale, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: t(locale, "Tables.tableName", { label: name }), exact: true }) });
/** The link a table's QR code carries, as the row shows it. */
export const scanUrl = async (r: Locator) => (await r.locator("bdi").innerText()).trim();
export const addTable = async (page: Page, locale: Locale, name: string) => {
  await page.locator("#new-table-label").fill(name);
  await page.getByRole("button", { name: t(locale, "Tables.add"), exact: true }).click();
  await expect(tableRow(page, locale, name)).toBeVisible();
};
export const removeTable = async (page: Page, site: Site, locale: Locale, name: string) => {
  await page.goto(`${site.origin}/${locale}/staff/tables`);
  const r = tableRow(page, locale, name);
  if (await r.count()) {
    await r.getByRole("button", { name: t(locale, "Tables.delete"), exact: true }).click();
    await expect(tableRow(page, locale, name)).toHaveCount(0);
  }
};
/** A guest's phone: a fresh browser context with nothing saved and nobody signed in. */
export async function guest(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}
