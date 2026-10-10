import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, LOCALES, SITES, signIn, t, type Locale, type Site } from "./support/demo";

const row = (page: Page, site: Site) => page.getByRole("listitem").filter({ hasText: site.toggleItem });

/** Marks an item sold out and back in stock, and always leaves it as it found it (available). */
async function toggleSoldOutAndBack(page: Page, site: Site, locale: Locale) {
  const item = row(page, site);
  await expect(item).toBeVisible();
  const soldOut = item.getByRole("button", { name: t(locale, "StaffMenu.markSoldOut") });
  const back = item.getByRole("button", { name: t(locale, "StaffMenu.markAvailable") });
  await expect(soldOut).toBeVisible(); // the seeded item starts available
  try {
    await soldOut.click();
    await expect(back).toBeVisible();
    await expect(item.getByText(t(locale, "StaffMenu.soldOut"), { exact: true })).toBeVisible();
  } finally {
    if (await back.isVisible()) await back.click();
    await expect(soldOut).toBeVisible();
  }
}

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the owner sees the menu with managing controls`, async ({ page }) => {
      await signIn(page, site, site.owner, locale);
      await page.goto(`${site.origin}/${locale}/staff/menu`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "StaffMenu.title"));
      await expect(row(page, site)).toBeVisible();
      // Owner controls are all there.
      await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffMenu.addCategory")) })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffMenu.optionGroups")) })).toBeVisible();
      await expect(row(page, site).getByRole("link", { name: t(locale, "StaffMenu.edit") })).toBeVisible();
      await expect(row(page, site).getByRole("button", { name: t(locale, "StaffMenu.hide") })).toBeVisible();
    });

    test(`${site.key} /${locale}: the owner can mark an item sold out and back in stock`, async ({ page }) => {
      await signIn(page, site, site.owner, locale);
      await page.goto(`${site.origin}/${locale}/staff/menu`);
      await toggleSoldOutAndBack(page, site, locale);
    });
  }
}

// Demo Grill has a waiter and a cashier: the waiter may only toggle sold out, the cashier only looks.
for (const locale of LOCALES) {
  test(`grill /${locale}: the waiter can toggle sold out but not edit or hide`, async ({ page }) => {
    const site = SITES.grill;
    await signIn(page, site, site.waiter, locale);
    await page.goto(`${site.origin}/${locale}/staff/menu`);
    await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffMenu.addCategory")) })).toHaveCount(0);
    await expect(row(page, site).getByRole("link", { name: t(locale, "StaffMenu.edit") })).toHaveCount(0);
    await expect(row(page, site).getByRole("button", { name: t(locale, "StaffMenu.hide") })).toHaveCount(0);
    await toggleSoldOutAndBack(page, site, locale);
  });

  test(`grill /${locale}: the cashier can read the menu but change nothing`, async ({ page }) => {
    const site = SITES.grill;
    await signIn(page, site, site.cashier, locale);
    await page.goto(`${site.origin}/${locale}/staff/menu`);
    await expect(row(page, site)).toBeVisible();
    await expect(page.getByRole("button", { name: t(locale, "StaffMenu.markSoldOut") })).toHaveCount(0);
    await expect(page.getByRole("button", { name: t(locale, "StaffMenu.hide") })).toHaveCount(0);
  });
}
