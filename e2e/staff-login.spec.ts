import { expect, test } from "@playwright/test";
import { ALL_SITES, expectLocale, LOCALES, PASSWORD, SITES, signIn, t, type Locale } from "./support/demo";

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    const other: Locale = locale === "en" ? "ar" : "en";

    test(`${site.key} /${locale}: a wrong password is refused with a translated error`, async ({ page }) => {
      await page.goto(`${site.origin}/${locale}/staff/login`);
      await expectLocale(page, locale);
      await page.getByLabel(t(locale, "StaffLogin.email")).fill(site.owner);
      await page.getByLabel(t(locale, "StaffLogin.password")).fill("not-the-password");
      await page.getByRole("button", { name: t(locale, "StaffLogin.submit") }).click();
      await expect(page.getByText(t(locale, "StaffLogin.invalid"))).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/login$`));
    });

    test(`${site.key} /${locale}: the owner signs in, sees the dashboard, can switch language and sign out`, async ({ page }) => {
      await signIn(page, site, site.owner, locale);
      await expectLocale(page, locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "StaffHome.title"));
      await expect(page.getByText(site.name[locale], { exact: true })).toBeVisible();
      await expect(page.getByText(t(locale, "Roles.OWNER"), { exact: true })).toBeVisible();

      // Regression: the switch used to flip only the direction and leave every word in the old language.
      await page.getByRole("link", { name: t(locale, "LanguageSwitch.label") }).click();
      await expect(page).toHaveURL(new RegExp(`/${other}/staff$`));
      await expectLocale(page, other);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(other, "StaffHome.title"));
      await expect(page.getByText(t(other, "Roles.OWNER"), { exact: true })).toBeVisible();

      await page.getByRole("button", { name: t(other, "StaffHome.signOut") }).click();
      await expect(page).toHaveURL(new RegExp(`/${other}/staff/login$`));
    });

    test(`${site.key} /${locale}: after 5 wrong passwords the account must wait, with a translated message`, async ({ page }) => {
      // A made-up account of this test only: the seeded demo accounts are never locked. Its failures (stored hashed)
      // stop counting after 15 minutes and are swept after a day.
      const email = `e2e-locked-${crypto.randomUUID()}@test.local`;
      const tryPassword = async (expected: string) => {
        await page.goto(`${site.origin}/${locale}/staff/login`); // a fresh form: no earlier message on screen
        await page.getByLabel(t(locale, "StaffLogin.email")).fill(email);
        await page.getByLabel(t(locale, "StaffLogin.password")).fill("not-the-password");
        await page.getByRole("button", { name: t(locale, "StaffLogin.submit") }).click();
        await expect(page.getByText(t(locale, expected))).toBeVisible();
      };
      for (let i = 0; i < 5; i++) await tryPassword("StaffLogin.invalid");
      await tryPassword("StaffLogin.tooManyAttempts");
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/login$`));
    });

    test(`${site.key} /${locale}: staff pages need a login`, async ({ page }) => {
      await page.goto(`${site.origin}/${locale}/staff`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/login$`));
      await page.goto(`${site.origin}/${locale}/staff/menu`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/login$`));
      for (const screen of ["orders", "open-tables"]) {
        await page.goto(`${site.origin}/${locale}/staff/${screen}`);
        await expect(page).toHaveURL(new RegExp(`/${locale}/staff/login$`));
      }
    });
  }
}

test("staff of one restaurant cannot sign in on the other restaurant's site", async ({ page }) => {
  // Demo Grill's owner on Demo Coffee's site: same error as a wrong password, and no session is left behind.
  await page.goto(`${SITES.coffee.origin}/en/staff/login`);
  await page.getByLabel(t("en", "StaffLogin.email")).fill(SITES.grill.owner);
  await page.getByLabel(t("en", "StaffLogin.password")).fill(PASSWORD);
  await page.getByRole("button", { name: t("en", "StaffLogin.submit") }).click();
  await expect(page.getByText(t("en", "StaffLogin.invalid"))).toBeVisible();
  await page.goto(`${SITES.coffee.origin}/en/staff`);
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
});
