import { expect, test, type Page } from "@playwright/test";
import { addButton, cartBar, confirmation, dialog, menuRow, placeButton } from "./support/cart";
import { ALL_SITES, jd, LOCALES, signIn, SITES, t, type Locale, type Site } from "./support/demo";
import { cancelOrderOn } from "./support/staff";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// Takeout from the customer's side: no table, a name and a mobile number, an order number, and the order followed on
// the same phone. Both demo restaurants take takeout orders (Demo Coffee nothing else). Every customer here is called
// "E2E ...": the orders are cancelled at the end (which ends the pickup visit), and e2e/support/global-cleanup.ts
// removes them from the database before and after the suite.

const yourOrders = (page: Page, locale: Locale) => page.getByRole("region", { name: t(locale, "Menu.orders.title") });
const nameField = (page: Page, locale: Locale) => dialog(page).getByLabel(t(locale, "Menu.pickup.name"), { exact: true });
const phoneField = (page: Page, locale: Locale) => dialog(page).getByLabel(t(locale, "Menu.pickup.phone"), { exact: true });
const cartRow = (page: Page, locale: Locale, key: "subtotal" | "service" | "tax" | "total") =>
  dialog(page).locator("dl > div").filter({ hasText: new RegExp(`^${t(locale, `Menu.cart.${key}`)}`) });

/** The owner cancels the test's orders on the staff order screen: nothing unfinished stays behind. */
async function cancelAsOwner(page: Page, site: Site, locale: Locale, numbers: number[]) {
  await signIn(page, site, site.owner, locale);
  await page.goto(`${site.origin}/${locale}/staff/orders`);
  for (const number of numbers) await cancelOrderOn(page, locale, number, "OTHER");
}

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: a customer without a table places a takeout order and follows it on their phone`, async ({ page, browser }) => {
      const m = site.menu.simple;
      const customer = `E2E ${Math.floor(1000 + Math.random() * 9000)}`;
      const g = await guest(browser);
      await g.page.goto(`${site.origin}/${locale}/menu`);
      await expect(g.page.getByRole("status").filter({ hasText: customer })).toHaveCount(0);

      // The cart: a takeout estimate (no service charge, also where tables have one) and the takeout form.
      await addButton(menuRow(g.page, m[locale]), locale).click();
      await cartBar(g.page, locale).click();
      await expect(cartRow(g.page, locale, "total")).toContainText(jd(m.pickupOne.total, locale));
      await expect(cartRow(g.page, locale, "tax")).toContainText(jd(m.pickupOne.tax, locale));
      await expect(cartRow(g.page, locale, "service")).toHaveCount(0);
      await expect(dialog(g.page).getByText(t(locale, "Menu.pickup.note"), { exact: false })).toBeVisible();
      // The hint about scanning a table only where the restaurant has table ordering.
      await expect(dialog(g.page).getByText(t(locale, "Menu.pickup.tableHint"), { exact: false })).toHaveCount(site.tables.dineIn ? 1 : 0);

      // Without a name, and with a number that is not a Jordanian mobile, nothing is ordered and the field says why.
      await placeButton(g.page, locale).click();
      await expect(dialog(g.page).getByText(t(locale, "Menu.order.errors.nameRequired"))).toBeVisible();
      await nameField(g.page, locale).fill(customer);
      await phoneField(g.page, locale).fill("06 412 3456");
      await placeButton(g.page, locale).click();
      await expect(dialog(g.page).getByText(t(locale, "Menu.order.errors.phoneInvalid"))).toBeVisible();
      await expect(yourOrders(g.page, locale)).toHaveCount(0);

      // A real one: the order number, and what happens next.
      await phoneField(g.page, locale).fill("079 123 4567");
      await placeButton(g.page, locale).click();
      await expect(dialog(g.page)).toContainText(t(locale, "Menu.order.pickupBody"));
      const first = await confirmation(g.page, locale);

      // From now on this phone holds the pickup order: its banner, and the order under "your orders" with its total.
      await expect(g.page.getByRole("status").filter({ hasText: t(locale, "Menu.pickup.banner", { name: customer }) })).toBeVisible();
      const mine = (number: number) => yourOrders(g.page, locale).getByRole("listitem", { name: t(locale, "Menu.orders.order", { number }), exact: true });
      await expect(mine(first)).toContainText(t(locale, "Menu.orders.status.NEW"));
      await expect(mine(first)).toContainText(jd(m.pickupOne.total, locale));

      // Ordering again while that order is in progress: no name is asked, it joins the same pickup order.
      await addButton(menuRow(g.page, m[locale]), locale).click();
      await cartBar(g.page, locale).click();
      await expect(nameField(g.page, locale)).toHaveCount(0);
      await expect(dialog(g.page).getByText(t(locale, "Menu.pickup.openNote", { name: customer }))).toBeVisible();
      await placeButton(g.page, locale).click();
      const second = await confirmation(g.page, locale);
      expect(second).toBeGreaterThan(first);
      await expect(mine(second)).toBeVisible();
      await expect(mine(first)).toBeVisible();

      // The name and number are remembered on this phone for the next takeout order (after this one has ended).
      await cancelAsOwner(page, site, locale, [first, second]);
      await g.page.reload();
      await expect(g.page.getByRole("status").filter({ hasText: customer })).toHaveCount(0); // the pickup order is over
      await expect(yourOrders(g.page, locale)).toHaveCount(0);
      await addButton(menuRow(g.page, m[locale]), locale).click();
      await cartBar(g.page, locale).click();
      await expect(nameField(g.page, locale)).toHaveValue(customer);
      await expect(phoneField(g.page, locale)).toHaveValue("079 123 4567");
      await g.context.close();
    });
  }
}

test("where both are offered, a phone that scanned a table orders for the table, with the service charge and no takeout form", async ({ page, browser }) => {
  const site = SITES.grill;
  const m = site.menu.simple;
  const name = tableLabel();
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", name);
    const g = await guest(browser);
    await g.page.goto(await scanUrl(tableRow(page, "en", name)));
    await g.page.goto(`${site.origin}/en/menu`);
    await addButton(menuRow(g.page, m.en), "en").click();
    await cartBar(g.page, "en").click();
    await expect(nameField(g.page, "en")).toHaveCount(0);
    await expect(cartRow(g.page, "en", "service")).toContainText(jd(m.one.svc, "en"));
    await expect(cartRow(g.page, "en", "total")).toContainText(jd(m.one.total, "en"));
    await g.context.close();
  } finally {
    await removeTable(page, site, "en", name);
  }
});
