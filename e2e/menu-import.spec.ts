import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, jd, LOCALES, signIn, SITES, t, type Locale } from "./support/demo";

// Importing the menu from a spreadsheet (a CSV file), for the owner and manager. Everything the tests add is called
// "E2E ...": e2e/support/global-cleanup.ts deletes those items and categories before and after the suite, so the
// demo menus end as they started.

const HEADER = "category_en,category_ar,name_en,name_ar,description_en,description_ar,price";
const csv = (lines: string[]) => ({ name: "menu.csv", mimeType: "text/csv", buffer: Buffer.from(`﻿${[HEADER, ...lines].join("\r\n")}\r\n`, "utf8") });

async function upload(page: Page, locale: Locale, file: ReturnType<typeof csv>) {
  await page.getByLabel(t(locale, "MenuImport.file"), { exact: true }).setInputFiles(file);
  await page.getByRole("button", { name: t(locale, "MenuImport.check"), exact: true }).click();
}

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the owner imports menu items from a CSV file after checking the preview`, async ({ page, browser }) => {
      const run = Math.floor(1000 + Math.random() * 9000);
      const category = { en: `E2E Import ${run}`, ar: `E2E استيراد ${run}` };
      const tea = { en: `E2E Tea ${run}`, ar: `E2E شاي ${run}` };
      const cake = { en: `E2E Cake ${run}`, ar: `E2E كعكة ${run}` };

      await signIn(page, site, site.owner, locale);
      await page.goto(`${site.origin}/${locale}/staff/menu`);
      await page.getByRole("link", { name: t(locale, "StaffMenu.import"), exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/menu/import$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "MenuImport.title"));
      await expect(page.getByRole("link", { name: t(locale, "MenuImport.template"), exact: true })).toHaveAttribute("href", "/menu-import-template.csv");

      // Drafting from a photo or PDF needs an AI key on the server. The test machine has none: the page says so and
      // offers no upload for it. (With a key the upload appears; the real service is not called by any test.)
      await expect(page.getByRole("heading", { name: t(locale, "MenuImport.ai.title"), exact: true })).toBeVisible();
      await expect(page.getByText(t(locale, "MenuImport.ai.unavailable"))).toBeVisible();
      await expect(page.getByLabel(t(locale, "MenuImport.ai.file"), { exact: true })).toHaveCount(0);

      // A file without the column names: refused, saying which are missing.
      await upload(page, locale, { name: "menu.csv", mimeType: "text/csv", buffer: Buffer.from("name,price\nTea,2\n", "utf8") });
      await expect(page.getByRole("alert").filter({ hasText: t(locale, "MenuImport.fileProblems.header") })).toContainText("category_en");

      // A file with mistakes: the preview names them per line, and there is nothing to import.
      await upload(page, locale, csv([`${category.en},${category.ar},${tea.en},${tea.ar},,,2.500`, `${category.en},${category.ar},${cake.en},,,,cheap`]));
      const preview = page.getByRole("region", { name: t(locale, "MenuImport.previewTitle", { count: 2 }) });
      const bad = preview.getByRole("row").filter({ hasText: cake.en });
      await expect(bad).toContainText(t(locale, "MenuImport.rowProblems.nameAr"));
      await expect(bad).toContainText(t(locale, "MenuImport.rowProblems.price"));
      await expect(preview.getByRole("button")).toHaveCount(0);
      await expect(preview.getByRole("alert")).toBeVisible();

      // The corrected file: every row is fine, and Import adds a new category with its two items.
      const good = csv([`${category.en},${category.ar},${tea.en},${tea.ar},"Black tea, with mint",شاي بالنعنع,2.500`, `${category.en},${category.ar},${cake.en},${cake.ar},,,1.25`]);
      await upload(page, locale, good);
      await expect(preview.getByText(t(locale, "MenuImport.allGood"))).toBeVisible();
      await preview.getByRole("button").click();
      const done = page.getByRole("status").filter({ hasText: t(locale, "MenuImport.toMenu") });
      await expect(done).toBeVisible();
      await done.getByRole("link", { name: t(locale, "MenuImport.toMenu"), exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/menu$`));
      await expect(page.getByRole("heading", { name: category[locale], exact: false })).toBeVisible();
      await expect(page.getByText(tea.en, { exact: true })).toBeVisible();
      await expect(page.getByText(cake.ar, { exact: true })).toBeVisible();

      // Customers see them at once, with the price from the file.
      const guest = await browser.newContext();
      const guestPage = await guest.newPage();
      await guestPage.goto(`${site.origin}/${locale}/menu`);
      const row = guestPage.getByRole("listitem").filter({ has: guestPage.getByRole("heading", { level: 3, name: tea[locale], exact: true }) });
      await expect(row).toContainText(jd(2500, locale));
      await guest.close();

      // The same file again: nothing is added twice.
      await page.goto(`${site.origin}/${locale}/staff/menu/import`);
      await upload(page, locale, good);
      await preview.getByRole("button").click();
      await expect(page.getByRole("status").filter({ hasText: t(locale, "MenuImport.toMenu") })).toBeVisible();
      await page.goto(`${site.origin}/${locale}/staff/menu`);
      await expect(page.getByText(tea.en, { exact: true })).toHaveCount(1);
    });
  }
}

test("waiters and cashiers cannot import: the page does not exist for them", async ({ page }) => {
  const site = SITES.grill;
  for (const email of [site.waiter, site.cashier]) {
    await signIn(page, site, email, "en");
    await page.goto(`${site.origin}/en/staff/menu`);
    await expect(page.getByRole("link", { name: t("en", "StaffMenu.import"), exact: true })).toHaveCount(0);
    await page.goto(`${site.origin}/en/staff/menu/import`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "NotFound.title"));
    await page.goto(`${site.origin}/en/staff`);
    await page.getByRole("button", { name: t("en", "StaffHome.signOut") }).click();
    await expect(page).toHaveURL(/\/en\/staff\/login$/);
  }
});
