import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, LOCALES, signIn, t, type Locale, type Site } from "./support/demo";

const open = async (page: Page, site: Site, locale: Locale) => {
  await signIn(page, site, site.owner, locale);
  await page.goto(`${site.origin}/${locale}/staff/settings`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Settings.title"));
};
const field = (page: Page, locale: Locale, key: "taxPercent" | "servicePercent") =>
  page.getByLabel(t(locale, `Settings.${key}`), { exact: true });
const save = (page: Page, locale: Locale) => page.getByRole("button", { name: t(locale, "Common.save"), exact: true });

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: settings show the real values and refuse a rate that is not a percentage`, async ({ page }) => {
      await open(page, site, locale);
      const original = await field(page, locale, "servicePercent").inputValue();
      await expect(field(page, locale, "taxPercent")).toHaveValue(/^\d+(\.\d{1,2})?$/);

      await field(page, locale, "servicePercent").fill("abc");
      await save(page, locale).click();
      await expect(page.getByText(t(locale, "Settings.errors.invalidRate"))).toBeVisible();
      await expect(field(page, locale, "servicePercent")).toHaveValue("abc"); // what was typed is kept

      await page.reload();
      await expect(field(page, locale, "servicePercent")).toHaveValue(original); // nothing was saved
    });

    test(`${site.key} /${locale}: at least one order type must stay on`, async ({ page }) => {
      await open(page, site, locale);
      const modes = ["dineIn", "takeout", "delivery"].map((m) => page.getByLabel(t(locale, `Settings.${m}`)));
      const before = await Promise.all(modes.map((m) => m.isChecked()));
      for (const mode of modes) await mode.uncheck();

      await save(page, locale).click();
      await expect(page.getByText(t(locale, "Settings.errors.noMode"))).toBeVisible();

      await page.reload();
      expect(await Promise.all(modes.map((m) => m.isChecked()))).toEqual(before); // unchanged in the database
    });

    test(`${site.key} /${locale}: the owner saves a new service charge (and it is put back)`, async ({ page }) => {
      await open(page, site, locale);
      const original = await field(page, locale, "servicePercent").inputValue();
      const changed = original === "7.5" ? "8" : "7.5";
      try {
        await field(page, locale, "servicePercent").fill(changed);
        await save(page, locale).click();
        await expect(page.getByText(t(locale, "Settings.saved"))).toBeVisible();
        await page.reload();
        await expect(field(page, locale, "servicePercent")).toHaveValue(changed);
      } finally {
        await field(page, locale, "servicePercent").fill(original);
        await save(page, locale).click();
        await expect(page.getByText(t(locale, "Settings.saved"))).toBeVisible();
      }
    });
  }
}

test("Arabic digits are accepted in a percentage", async ({ page }) => {
  const site = ALL_SITES[0]!;
  await open(page, site, "ar");
  const original = await field(page, "ar", "servicePercent").inputValue();
  try {
    await field(page, "ar", "servicePercent").fill("١٢٫٥");
    await save(page, "ar").click();
    await expect(page.getByText(t("ar", "Settings.saved"))).toBeVisible();
    await page.reload();
    await expect(field(page, "ar", "servicePercent")).toHaveValue("12.5");
  } finally {
    await field(page, "ar", "servicePercent").fill(original);
    await save(page, "ar").click();
    await expect(page.getByText(t("ar", "Settings.saved"))).toBeVisible();
  }
});
