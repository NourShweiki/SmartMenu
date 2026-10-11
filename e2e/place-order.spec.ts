import { expect, test, type Page } from "@playwright/test";
import { jd, LOCALES, SITES, t, type Locale } from "./support/demo";
import { addButton, cartBar, confirmation, dialog, menuRow as row, placeAnOrder as order, placeButton } from "./support/cart";
import { hostOf, LOOPBACK_ORIGIN } from "./support/server";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// A guest places an order from the cart. Needs a table: each test adds its own ("E2E ...") and deletes it again.
// Orders cannot be deleted from any screen, so the orders placed here stay until `npx supabase db reset`.
// The refusals that need a visit to end (bill requested, closed) have no screen yet: the integration test
// `customer-order.integration.test.ts` and the unit tests cover them.

const banner = (page: Page, locale: Locale, name: string) => page.getByRole("status").filter({ hasText: t(locale, "Table.banner", { label: name }) });


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

test("when the reply is lost and the guest presses again, there is ONE order and the retry shows its number", async ({ page, browser }) => {
  const site = SITES.grill;
  const m = site.menu.simple;
  const name = tableLabel();
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", name);
    const g = await guest(browser);
    await g.page.goto(await scanUrl(tableRow(page, "en", name)));
    await g.page.goto(`${site.origin}/en/menu`);
    await addButton(row(g.page, m.en), "en").click();
    await cartBar(g.page, "en").click();

    // Weak Wi-Fi: the request reaches the server, which stores the order, but the answer never reaches the phone.
    let lost = 0;
    let lostOrderNumber = 0; // what the server answered, which the phone never saw
    let lostStatus = 0;
    await g.page.route("**/en/menu", async (route) => {
      if (route.request().method() === "POST" && lost === 0) {
        lost++;
        // The server does its work... (sent from the test process, which cannot resolve *.localhost names: go to
        // 127.0.0.1 and name the restaurant in the Host header, with the guest's own cookies and headers)
        const headers = { ...(await route.request().allHeaders()), host: hostOf(site.slug) };
        const reply = await route.fetch({ url: route.request().url().replace(site.origin, LOOPBACK_ORIGIN), headers });
        lostStatus = reply.status(); // checked below: a failed expectation in here would only hang the request
        lostOrderNumber = Number(/"orderNumber":(\d+)/.exec(await reply.text())?.[1]);
        await route.abort("failed"); // ...and its reply gets lost
      } else {
        await route.continue();
      }
    });
    await placeButton(g.page, "en").click();
    await expect(dialog(g.page).getByText(t("en", "Menu.order.errors.failed"))).toBeVisible();
    expect(lost).toBe(1);
    expect(lostStatus).toBe(200);
    expect(lostOrderNumber).toBeGreaterThanOrEqual(1); // the order WAS stored
    await expect(dialog(g.page)).toContainText(m.en); // the cart is kept, so the guest can simply press again

    await expect(placeButton(g.page, "en")).toBeEnabled();
    await placeButton(g.page, "en").click();
    // The second press shows the number of the order that was already stored, not a new one...
    expect(await confirmation(g.page, "en")).toBe(lostOrderNumber);
    await expect(cartBar(g.page, "en")).toHaveCount(0);

    // ...and no second copy was made behind the scenes: the next thing the guest orders (the same item again, on
    // purpose: a second round IS a new order) gets exactly the next number.
    expect(await order(g.page, "en", m.en)).toBe(lostOrderNumber + 1);
    await g.context.close();
  } finally {
    await removeTable(page, site, "en", name);
  }
});

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
