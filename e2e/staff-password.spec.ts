import { expect, test } from "@playwright/test";
import { ALL_SITES, expectLocale, LOCALES, PASSWORD, SITES, signIn, t } from "./support/demo";
import { passwordError, submitPasswordChange } from "./support/password";

// "Change my password" on the staff side. These tests NEVER change a demo account's password (everything else
// depends on it): they check the way in and every refusal. A real change, and the forced change of a temporary
// password, are tested on an account the test makes itself, in setup.spec.ts.

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the change-password page is reached from the dashboard and refuses what it should`, async ({ page }) => {
      await signIn(page, site, site.owner, locale);
      await page.getByRole("link", { name: t(locale, "StaffHome.passwordLink"), exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/password$`));
      await expectLocale(page, locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Password.title"));
      await expect(page.getByText(site.name[locale], { exact: true })).toBeVisible();
      // Not a temporary password: no notice, and the way back is there.
      await expect(page.getByText(t(locale, "Password.temporaryNotice"))).toHaveCount(0);
      await expect(page.getByRole("link", { name: new RegExp(t(locale, "Password.backToDashboard")) })).toBeVisible();

      await submitPasswordChange(page, locale, "not-my-password", "a brand new password");
      await expect(passwordError(page, locale, "wrong")).toBeVisible();
      await submitPasswordChange(page, locale, PASSWORD, "too short");
      await expect(passwordError(page, locale, "tooShort")).toBeVisible();
      await submitPasswordChange(page, locale, PASSWORD, "a brand new password", "a brand new passwrod");
      await expect(passwordError(page, locale, "mismatch")).toBeVisible();
      await submitPasswordChange(page, locale, PASSWORD, PASSWORD);
      await expect(passwordError(page, locale, "unchanged")).toBeVisible();
      await expect(page.getByText(t(locale, "Password.saved"))).toHaveCount(0);
      // After a refusal the fields are empty again: a password is never sent back to the browser.
      await expect(page.getByLabel(t(locale, "Password.current"), { exact: true })).toHaveValue("");

      // Nothing was changed: the demo password still signs in.
      await page.goto(`${site.origin}/${locale}/staff`);
      await page.getByRole("button", { name: t(locale, "StaffHome.signOut") }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/login$`)); // signed out for real before signing in again
      await signIn(page, site, site.owner, locale);
    });
  }
}

test("every role can open the change-password page; it needs a login", async ({ page }) => {
  const site = SITES.grill;
  await page.goto(`${site.origin}/en/staff/password`);
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
  for (const email of [site.waiter, site.cashier]) {
    await signIn(page, site, email, "en");
    await page.getByRole("link", { name: t("en", "StaffHome.passwordLink"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "Password.title"));
    await page.goto(`${site.origin}/en/staff`);
    await page.getByRole("button", { name: t("en", "StaffHome.signOut") }).click();
    await expect(page).toHaveURL(/\/en\/staff\/login$/);
  }
});
