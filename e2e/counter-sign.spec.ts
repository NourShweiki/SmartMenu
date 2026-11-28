import { expect, test } from "@playwright/test";
import { LOCALES, signIn, SITES, t } from "./support/demo";

// The QR sign for the counter (PROJECT_SPEC.md §3.3) at Demo Coffee: the owner opens it from the dashboard; it shows
// the restaurant, the text in both languages, a QR code and the address under it; that address opens the menu.
// Whoever may not print codes does not get it.

const site = SITES.coffee;

for (const locale of LOCALES) {
  test(`coffee /${locale}: the owner prints a QR sign for the counter, and its address opens the menu`, async ({ page, browser }) => {
    await signIn(page, site, site.owner, locale);
    await page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.counterSignLink")) }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/staff/counter-sign$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "CounterSign.title"));
    await expect(page.getByRole("button", { name: t(locale, "Tables.printButton"), exact: true })).toBeVisible();

    // The sign: both languages whatever the owner's language, the QR code, and the address (default language: Arabic).
    const sign = page.getByRole("region", { name: t(locale, "CounterSign.signLabel"), exact: true });
    await expect(sign).toContainText(site.name.en);
    await expect(sign).toContainText(site.name.ar);
    await expect(sign).toContainText(t("en", "CounterCard.title"));
    await expect(sign).toContainText(t("ar", "CounterCard.title"));
    await expect(sign.getByRole("img", { name: t("en", "CounterCard.qrLabel"), exact: true })).toBeVisible();
    const address = `${site.origin}/ar/menu`;
    await expect(sign).toContainText(address);

    // A customer who opens it lands on the menu (as takeout: no table here).
    const phone = await browser.newContext();
    const p = await phone.newPage();
    await p.goto(address);
    await expect(p.getByRole("heading", { level: 1 })).toHaveText(t("ar", "Menu.title"));
    await phone.close();
  });
}

test("the counter sign is for whoever prints codes: the cashier gets no link and a 404", async ({ page }) => {
  const grill = SITES.grill; // the only demo restaurant with a seeded cashier; it takes takeout orders too
  await signIn(page, grill, grill.cashier, "en");
  await expect(page.getByRole("link", { name: new RegExp(t("en", "StaffHome.counterSignLink")) })).toHaveCount(0);
  await page.goto(`${grill.origin}/en/staff/counter-sign`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "NotFound.title"));
});
