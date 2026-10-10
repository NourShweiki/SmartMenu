import { expect, test } from "@playwright/test";
import { ALL_SITES, expectLocale, LOCALES, t, type Locale } from "./support/demo";

// The public page of each demo restaurant, in both languages. The language switch must change ALL the text
// and the direction (a past bug changed only the direction).
for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    const other: Locale = locale === "en" ? "ar" : "en";

    test(`${site.key} /${locale}: public page shows the restaurant in the right language`, async ({ page }) => {
      await page.goto(`${site.origin}/${locale}`);
      await expectLocale(page, locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(site.name[locale]);
      // The other language's name is shown small underneath.
      await expect(page.getByText(site.name[other], { exact: true })).toBeVisible();
    });

    test(`${site.key} /${locale}: the language switch changes the text, not only the direction`, async ({ page }) => {
      await page.goto(`${site.origin}/${locale}`);
      await page.getByRole("link", { name: t(locale, "LanguageSwitch.label") }).click();
      await expect(page).toHaveURL(new RegExp(`/${other}$`));
      await expectLocale(page, other);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(site.name[other]);
    });
  }
}

test("an unknown restaurant subdomain is a 404, the bare domain is the platform page", async ({ page }) => {
  const missing = await page.goto("http://no-such-place.localhost:3000/en");
  expect(missing?.status()).toBe(404);
  await page.goto("http://localhost:3000/en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "Home.platformName"));
});
