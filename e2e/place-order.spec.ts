import { expect, test, type Page } from "@playwright/test";
import { jd, LOCALES, SITES, t, type Locale } from "./support/demo";
import { addButton, cartBar, dialog, menuRow as row } from "./support/cart";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// A guest places an order from the cart. Needs a table: each test adds its own ("E2E ...") and deletes it again.
// Orders cannot be deleted from any screen, so the orders placed here stay until `npx supabase db reset`.
// The refusals that need a visit to end (bill requested, closed) have no screen yet: the integration test
// `customer-order.integration.test.ts` and the unit tests cover them.

const placeButton = (page: Page, locale: Locale) => dialog(page).getByRole("button", { name: t(locale, "Menu.cart.placeOrder") });
const banner = (page: Page, locale: Locale, name: string) => page.getByRole("status").filter({ hasText: t(locale, "Table.banner", { label: name }) });

/** Adds the simple item, opens the cart, places the order and returns the number the confirmation shows. */
async function order(page: Page, locale: Locale, itemName: string): Promise<number> {
  await addButton(row(page, itemName), locale).click();
  await cartBar(page, locale).click();
  await expect(placeButton(page, locale)).toBeEnabled();
  await placeButton(page, locale).click();
  await expect(dialog(page).getByRole("heading", { name: t(locale, "Menu.order.title") })).toBeVisible();
  await expect(dialog(page)).toContainText(t(locale, "Menu.order.numberLabel"));
  const number = Number((await dialog(page).locator("bdi").innerText()).trim());
  expect(Number.isInteger(number) && number >= 1).toBe(true);
  await dialog(page).getByRole("button", { name: t(locale, "Menu.order.done") }).click();
  await expect(dialog(page)).toHaveCount(0);
  return number;
}

for (const locale of LOCALES) {
  test(`grill /${locale}: a guest at a table places an order, gets its number, and can order again`, async ({ page, browser }) => {
    const site = SITES.grill;
    const m = site.menu.simple;
    const name = tableLabel();
    await openTables(page, site, "en");
    try {
      await addTable(page, "en", name);
      const g = await guest(browser);
      await g.page.goto(await scanUrl(tableRow(page, "en", name)));
      await expect(g.page).toHaveURL(/\/menu$/);
      await g.page.goto(`${site.origin}/${locale}/menu`);
      await expect(banner(g.page, locale, name)).toBeVisible();

      // The cart shows the hand-computed total, and the button is on with no "scan first" note.
      await addButton(row(g.page, m[locale]), locale).click();
      await cartBar(g.page, locale).click();
      await expect(dialog(g.page)).toContainText(jd(m.one.total, locale));
      await expect(dialog(g.page).getByText(t(locale, "Menu.cart.checkoutSoon"))).toHaveCount(0);
      await dialog(g.page).getByRole("button", { name: t(locale, "Menu.close") }).click();
      // (that was one in the cart already: `order` adds a second, so the first order is for two)
      const first = await order(g.page, locale, m[locale]);

      // The cart is empty (also after a reload), the guest is still at the table, and can order more.
      await expect(cartBar(g.page, locale)).toHaveCount(0);
      await g.page.reload();
      await expect(cartBar(g.page, locale)).toHaveCount(0);
      await expect(banner(g.page, locale, name)).toBeVisible();
      expect(await order(g.page, locale, m[locale])).toBe(first + 1);
      await g.context.close();
    } finally {
      await removeTable(page, site, "en", name);
    }
  });

  test(`coffee /${locale}: dine-in is off, so its table code is not active and the cart cannot place an order`, async ({ page }) => {
    const site = SITES.coffee;
    await page.goto(`${site.origin}/t/${site.tables.token}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`${t("ar", "Table.invalidTitle")}|${t("en", "Table.invalidTitle")}`));
    await page.goto(`${site.origin}/${locale}/menu`);
    await expect(page.getByRole("status").filter({ hasText: t(locale, "Table.banner", { label: site.tables.labels[0] }) })).toHaveCount(0);
    await addButton(row(page, site.menu.simple[locale]), locale).click();
    await cartBar(page, locale).click();
    await expect(placeButton(page, locale)).toBeDisabled();
    await expect(dialog(page).getByText(t(locale, "Menu.cart.checkoutSoon"))).toBeVisible();
  });
}

test("a line that can no longer be ordered switches Place order off until it is removed; the cart is frozen while sending", async ({ page, browser }) => {
  const site = SITES.grill;
  const name = tableLabel();
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", name);
    const g = await guest(browser);
    await g.page.goto(await scanUrl(tableRow(page, "en", name)));
    await g.page.goto(`${site.origin}/en/menu`);
    await addButton(row(g.page, site.menu.simple.en), "en").click();
    // An item that left the menu since it was added (here: an id the menu does not have).
    await g.page.evaluate(() => {
      const key = "smartmenu:cart:demo-dinein";
      const cart = JSON.parse(window.localStorage.getItem(key)!);
      const gone = "00000000-0000-4000-8000-00000000dead";
      cart.lines.push({ key: `${gone}|`, menuItemId: gone, optionIds: [], quantity: 1 });
      window.localStorage.setItem(key, JSON.stringify(cart));
    });
    await g.page.reload();
    await cartBar(g.page, "en").click();
    await expect(placeButton(g.page, "en")).toBeDisabled();
    await expect(dialog(g.page).getByText(t("en", "Menu.cart.fixFirst"))).toBeVisible();

    await dialog(g.page).getByRole("listitem").filter({ hasText: t("en", "Menu.cart.unknownItem") }).getByRole("button", { name: t("en", "Menu.cart.remove") }).click();
    await expect(dialog(g.page).getByText(t("en", "Menu.cart.fixFirst"))).toHaveCount(0);
    await expect(placeButton(g.page, "en")).toBeEnabled();

    // While the order is on its way (the reply is held back here) the cart is frozen: it cannot be closed or edited,
    // so the confirmation is always seen and no change is lost.
    await g.page.route("**/en/menu", async (route) => {
      if (route.request().method() === "POST") await new Promise((done) => setTimeout(done, 2000));
      await route.continue();
    });
    await placeButton(g.page, "en").click();
    await expect(dialog(g.page).getByRole("button", { name: t("en", "Menu.cart.placing") })).toBeDisabled();
    await expect(dialog(g.page).getByRole("button", { name: t("en", "Menu.close") })).toBeDisabled();
    await expect(dialog(g.page).getByRole("button", { name: t("en", "Menu.cart.remove") })).toBeDisabled();
    await g.page.keyboard.press("Escape");
    await expect(dialog(g.page).getByRole("heading", { name: t("en", "Menu.order.title") })).toBeVisible();
    await g.context.close();
  } finally {
    await removeTable(page, site, "en", name);
  }
});
