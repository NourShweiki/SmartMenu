import { expect, test } from "@playwright/test";
import { LOCALES, SITES, signIn, t, type Locale } from "./support/demo";

const grill = SITES.grill;

/** What each role sees on the staff dashboard (cards). Owner-only cards must not even be offered to the others. */
for (const locale of LOCALES) {
  test(`grill /${locale}: the owner is offered menu, settings and branding`, async ({ page }) => {
    await signIn(page, grill, grill.owner, locale);
    for (const key of ["menuLink", "settingsLink", "brandingLink"]) {
      await expect(page.getByRole("link", { name: new RegExp(t(locale, `StaffHome.${key}`)) })).toBeVisible();
    }
  });

  for (const [role, email] of [
    ["WAITER", grill.waiter],
    ["CASHIER", grill.cashier],
  ] as const) {
    test(`grill /${locale}: the ${role.toLowerCase()} only sees the menu, and owner pages are 404`, async ({ page }) => {
      await signIn(page, grill, email, locale);
      await expect(page.getByText(t(locale, `Roles.${role}`), { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.menuLink")) })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.settingsLink")) })).toHaveCount(0);
      await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.brandingLink")) })).toHaveCount(0);

      for (const path of ["settings", "branding"]) {
        await page.goto(`${grill.origin}/${locale}/staff/${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "NotFound.title"));
        await expect(page.locator("form")).toHaveCount(0); // nothing of the owner's screen leaks
      }
    });
  }
}

test("the dashboard only exists for staff of that restaurant: Coffee has just an owner", async ({ page }) => {
  const locale: Locale = "en";
  await signIn(page, SITES.coffee, SITES.coffee.owner, locale);
  await expect(page.getByText(SITES.coffee.name[locale], { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.settingsLink")) })).toBeVisible();
});
