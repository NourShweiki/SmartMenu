import { expect, test, type Locator, type Page } from "@playwright/test";
import { ALL_SITES, expectLocale, jd, LOCALES, t, type Locale, type Site } from "./support/demo";

// The customer menu and cart: public (nobody is signed in), both restaurants, both languages.
// Expected totals in e2e/support/demo.ts are computed by hand from the seed, not with the app's own formulas.

const open = async (page: Page, site: Site, locale: Locale) => {
  await page.goto(`${site.origin}/${locale}/menu`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Menu.title"));
};
const row = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
const addButton = (r: Locator, locale: Locale) => r.getByRole("button", { name: new RegExp(`^${t(locale, "Menu.add")}`) });
const cartBar = (page: Page, locale: Locale) => page.getByRole("button", { name: new RegExp(t(locale, "Menu.cart.view")) });
const dialog = (page: Page) => page.getByRole("dialog");
const totalsRow = (page: Page, locale: Locale, key: "subtotal" | "service" | "tax" | "total") =>
  dialog(page).locator("dl > div").filter({ hasText: new RegExp(`^${t(locale, `Menu.cart.${key}`)}`) });

type Totals = { sub: number; svc: number; tax: number; total: number };
async function expectTotals(page: Page, locale: Locale, e: Totals) {
  await expect(totalsRow(page, locale, "subtotal")).toContainText(jd(e.sub, locale));
  await expect(totalsRow(page, locale, "total")).toContainText(jd(e.total, locale));
  await expect(totalsRow(page, locale, "tax")).toContainText(jd(e.tax, locale));
  // No service charge (Demo Coffee): the line is not shown at all.
  if (e.svc > 0) await expect(totalsRow(page, locale, "service")).toContainText(jd(e.svc, locale));
  else await expect(totalsRow(page, locale, "service")).toHaveCount(0);
}

for (const site of ALL_SITES) {
  const m = site.menu;
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the menu is public and shows the restaurant's items with prices`, async ({ page }) => {
      await open(page, site, locale);
      await expectLocale(page, locale);
      await expect(row(page, m.simple[locale])).toBeVisible();
      await expect(row(page, m.simple[locale])).toContainText(jd(m.simple.fils, locale));
      await expect(row(page, m.withOptions[locale])).toBeVisible();
      if (m.soldOut) {
        // A sold-out item is shown, but cannot be added.
        await expect(row(page, m.soldOut[locale])).toContainText(t(locale, "Menu.soldOut"));
        await expect(addButton(row(page, m.soldOut[locale]), locale)).toHaveCount(0);
      }
      if (m.hiddenOrDeleted) await expect(page.getByText(m.hiddenOrDeleted, { exact: true })).toHaveCount(0); // never shown to customers
      await expect(page.getByRole("button", { name: t(locale, "Menu.cart.placeOrder") })).toHaveCount(0); // nothing in the cart yet
    });

    test(`${site.key} /${locale}: an item without choices goes straight into the cart with the right totals`, async ({ page }) => {
      await open(page, site, locale);
      await expect(cartBar(page, locale)).toHaveCount(0); // empty cart: no cart bar
      await addButton(row(page, m.simple[locale]), locale).click();
      await expect(page.getByText(t(locale, "Menu.added", { name: m.simple[locale] }))).toBeVisible();

      await expect(cartBar(page, locale)).toContainText(jd(m.simple.one.total, locale));
      await cartBar(page, locale).click();
      await expect(dialog(page).getByRole("heading", { name: t(locale, "Menu.cart.title") })).toBeVisible();
      await expect(dialog(page)).toContainText(m.simple[locale]);
      await expectTotals(page, locale, m.simple.one);
      // Ordering itself comes with the table QR code: the button exists but is off, with the reason.
      await expect(dialog(page).getByRole("button", { name: t(locale, "Menu.cart.placeOrder") })).toBeDisabled();
      await expect(dialog(page).getByText(t(locale, "Menu.cart.checkoutSoon"))).toBeVisible();
    });

    test(`${site.key} /${locale}: choices are enforced and change the price`, async ({ page }) => {
      await open(page, site, locale);
      await addButton(row(page, m.withOptions[locale]), locale).click();
      const picker = dialog(page);
      await expect(picker.getByRole("heading", { name: m.withOptions[locale] })).toBeVisible();
      const submit = picker.getByRole("button", { name: new RegExp(t(locale, "Menu.addToCart")) });

      // A required choice (Demo Grill: size) blocks adding until it is made; an optional one (Demo Coffee: milk) does not.
      if (m.withOptions.requiredChoice) await expect(submit).toBeDisabled();
      else await expect(submit).toBeEnabled();

      for (const choice of m.withOptions.choose) await picker.getByLabel(choice[locale]).check();
      await expect(submit).toBeEnabled();
      for (let i = 1; i < m.withOptions.quantity; i++) await picker.getByRole("button", { name: t(locale, "Menu.increase") }).click();
      await expect(submit).toContainText(jd(m.withOptions.expected.sub, locale)); // the price on the button follows the choices
      await submit.click();
      await expect(dialog(page)).toHaveCount(0); // the picker closes

      await cartBar(page, locale).click();
      for (const choice of m.withOptions.choose) await expect(dialog(page)).toContainText(choice[locale]);
      await expectTotals(page, locale, m.withOptions.expected);
    });

    test(`${site.key} /${locale}: quantities change the totals, and lowering to zero removes the line`, async ({ page }) => {
      await open(page, site, locale);
      await addButton(row(page, m.simple[locale]), locale).click();
      await cartBar(page, locale).click();

      await dialog(page).getByRole("button", { name: new RegExp(`^${t(locale, "Menu.increase")}`) }).click();
      await expectTotals(page, locale, m.simple.two);
      await dialog(page).getByRole("button", { name: new RegExp(`^${t(locale, "Menu.decrease")}`) }).click();
      await expectTotals(page, locale, m.simple.one);
      await dialog(page).getByRole("button", { name: new RegExp(`^${t(locale, "Menu.decrease")}`) }).click(); // 1 -> 0 removes
      await expect(dialog(page).getByText(t(locale, "Menu.cart.empty"))).toBeVisible();

      await dialog(page).getByRole("button", { name: t(locale, "Menu.close") }).first().click();
      await expect(cartBar(page, locale)).toHaveCount(0);
    });

    test(`${site.key} /${locale}: the cart survives a reload and a language switch, and Remove empties it`, async ({ page }) => {
      const other: Locale = locale === "en" ? "ar" : "en";
      await open(page, site, locale);
      await addButton(row(page, m.simple[locale]), locale).click();
      await expect(cartBar(page, locale)).toBeVisible();

      await page.reload();
      await expect(cartBar(page, locale)).toContainText(jd(m.simple.one.total, locale)); // read back from this browser

      await page.getByRole("link", { name: t(locale, "LanguageSwitch.label") }).click();
      await expect(page).toHaveURL(new RegExp(`/${other}/menu$`));
      await expect(cartBar(page, other)).toContainText(jd(m.simple.one.total, other)); // same cart, other language

      await cartBar(page, other).click();
      await dialog(page).getByRole("button", { name: t(other, "Menu.cart.remove") }).click();
      await expect(dialog(page).getByText(t(other, "Menu.cart.empty"))).toBeVisible();
      await page.reload();
      await expect(cartBar(page, other)).toHaveCount(0); // gone for good
    });
  }
}

test("each restaurant has its own cart", async ({ page }) => {
  const [grill, coffee] = ALL_SITES as [Site, Site];
  await open(page, grill, "en");
  await addButton(row(page, grill.menu.simple.en), "en").click();
  await expect(cartBar(page, "en")).toBeVisible();
  await open(page, coffee, "en"); // other restaurant = other site = other cart
  await expect(cartBar(page, "en")).toHaveCount(0);
  await expect(page.getByText(grill.menu.simple.en, { exact: true })).toHaveCount(0); // and never the other's menu
});

test("a broken or hand-edited saved cart does not break the page", async ({ page }) => {
  const site = ALL_SITES[0]!;
  await open(page, site, "en");
  await page.evaluate(() => localStorage.setItem("smartmenu:cart:demo-dinein", '{"lines":[{"menuItemId":"not-a-real-item","optionIds":[],"quantity":2},"junk",null]}'));
  await page.reload();
  // The unknown item is kept in the cart (the menu may change), flagged, and blocks nothing else.
  await cartBar(page, "en").click();
  await expect(dialog(page).getByRole("alert")).toContainText(t("en", "Menu.cart.problems.ITEM_UNAVAILABLE"));
  await dialog(page).getByRole("button", { name: t("en", "Menu.cart.remove") }).click();
  await expect(dialog(page).getByText(t("en", "Menu.cart.empty"))).toBeVisible();

  await page.evaluate(() => localStorage.setItem("smartmenu:cart:demo-dinein", "this is not json"));
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "Menu.title"));
  await expect(cartBar(page, "en")).toHaveCount(0);
});

test("when an item cannot be added (cart full), the reason is shown inside the open choice sheet", async ({ page }) => {
  const site = ALL_SITES[0]!;
  const m = site.menu;
  await open(page, site, "en");
  // A cart that already holds the maximum number of different lines (50).
  await page.evaluate(() => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ key: `x${i}|`, menuItemId: `x${i}`, optionIds: [], quantity: 1 }));
    localStorage.setItem("smartmenu:cart:demo-dinein", JSON.stringify({ lines }));
  });
  await page.reload();

  await addButton(row(page, m.withOptions.en), "en").click();
  const picker = dialog(page);
  for (const choice of m.withOptions.choose) await picker.getByLabel(choice.en).check();
  await picker.getByRole("button", { name: new RegExp(t("en", "Menu.addToCart")) }).click();

  // The sheet stays open and says why (a message behind the modal would be invisible).
  await expect(picker.getByRole("alert")).toContainText(t("en", "Menu.errors.cartFull", { max: 50 }));
  await expect(picker.getByRole("heading", { name: m.withOptions.en })).toBeVisible();
});
