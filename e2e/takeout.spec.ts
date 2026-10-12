import { expect, test, type Browser, type Page } from "@playwright/test";
import { addButton, cartBar, confirmation, dialog, menuRow, placeAnOrder, placeButton } from "./support/cart";
import { ALL_SITES, jd, LOCALES, signIn, SITES, t, type Locale, type Site } from "./support/demo";
import { cancelButton, cancelOrderOn, orderCard, ORDERS, staffAt, tableCard } from "./support/staff";
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

/** A customer (a fresh phone) places one takeout order of the simple item; returns its number and the phone. */
async function takeoutOrder(browser: Browser, site: Site, locale: Locale, customer: string) {
  const g = await guest(browser);
  await g.page.goto(`${site.origin}/${locale}/menu`);
  await addButton(menuRow(g.page, site.menu.simple[locale]), locale).click();
  await cartBar(g.page, locale).click();
  await nameField(g.page, locale).fill(customer);
  await phoneField(g.page, locale).fill("0791234567");
  await placeButton(g.page, locale).click();
  return { number: await confirmation(g.page, locale), phone: g };
}

/** On the staff order screen: a takeout order from new to completed, with the takeout wording for "served". */
async function takeTakeoutThrough(page: Page, locale: Locale, number: number) {
  const card = orderCard(page, locale, number);
  const press = (label: string) => card.getByRole("button", { name: label, exact: true }).click();
  await press(t(locale, "StaffOrders.action.CONFIRMED"));
  await expect(card).toContainText(t(locale, "StaffOrders.status.CONFIRMED"));
  await press(t(locale, "StaffOrders.action.PREPARING"));
  await expect(card).toContainText(t(locale, "StaffOrders.status.PREPARING"));
  await press(t(locale, "StaffOrders.action.READY"));
  await expect(card).toContainText(t(locale, "StaffOrders.status.READY"));
  await press(t(locale, "StaffOrders.pickup.handOver"));
  await expect(card).toContainText(t(locale, "StaffOrders.pickup.served"));
  await press(t(locale, "StaffOrders.action.COMPLETED"));
  await expect(card).toHaveCount(0);
}

for (const locale of LOCALES) {
  test(`coffee /${locale}: staff see a takeout order with the customer's name and number and take it to completed; the customer is told it is ready`, async ({ page, browser }) => {
    const site = SITES.coffee;
    const customer = `E2E ${Math.floor(1000 + Math.random() * 9000)}`;
    const { number, phone } = await takeoutOrder(browser, site, locale, customer);

    await signIn(page, site, site.owner, locale);
    await page.goto(`${site.origin}/${locale}/staff/orders`);
    const card = orderCard(page, locale, number);
    await expect(card).toContainText(t(locale, "StaffOrders.pickup.badge"));
    await expect(card).toContainText(customer);
    await expect(card.getByRole("link", { name: "+962791234567" })).toHaveAttribute("href", "tel:+962791234567");
    await expect(card).not.toContainText(t(locale, "StaffOrders.noTable"));
    await expect(card).toContainText(jd(site.menu.simple.pickupOne.total, locale));

    // Ready: the customer's phone says so by itself.
    for (const step of ["CONFIRMED", "PREPARING", "READY"] as const) {
      await card.getByRole("button", { name: t(locale, `StaffOrders.action.${step}`), exact: true }).click();
      await expect(card).toContainText(t(locale, `StaffOrders.status.${step}`));
    }
    await expect(phone.page.getByRole("alert").filter({ hasText: t(locale, "Menu.orders.readyNotice", { number }) })).toBeVisible();

    // Handed over, paid: the order leaves the queue and the customer's pickup order is over.
    await card.getByRole("button", { name: t(locale, "StaffOrders.pickup.handOver"), exact: true }).click();
    await expect(card).toContainText(t(locale, "StaffOrders.pickup.served"));
    await card.getByRole("button", { name: t(locale, "StaffOrders.action.COMPLETED"), exact: true }).click();
    await expect(card).toHaveCount(0);
    await phone.page.reload();
    await expect(phone.page.getByRole("status").filter({ hasText: customer })).toHaveCount(0);
    // A takeout order is not a table: the open tables screen never listed it.
    await page.goto(`${site.origin}/${locale}/staff/open-tables`);
    await expect(page.getByText(customer)).toHaveCount(0);
    await phone.context.close();
  });
}

test("grill: the cashier alone takes a takeout order through every step, and still cannot confirm an order at a table", async ({ page, browser }) => {
  const site = SITES.grill;
  const customer = `E2E ${Math.floor(1000 + Math.random() * 9000)}`;
  const name = tableLabel();
  await openTables(page, site, "en"); // the owner, to make a table for the comparison
  try {
    await addTable(page, "en", name);
    const atTable = await guest(browser);
    await atTable.page.goto(await scanUrl(tableRow(page, "en", name)));
    await atTable.page.goto(`${site.origin}/en/menu`);
    const tableOrder = await placeAnOrder(atTable.page, "en", site.menu.simple.en);
    const { number, phone } = await takeoutOrder(browser, site, "en", customer);

    const till = await staffAt(browser, site, site.cashier, "en", ORDERS);
    // The table order waits for the floor staff: no button for the cashier. The takeout order has one for every step.
    await expect(orderCard(till.page, "en", tableOrder).getByRole("button", { name: t("en", "StaffOrders.action.CONFIRMED"), exact: true })).toHaveCount(0);
    await expect(orderCard(till.page, "en", tableOrder)).toContainText(t("en", "StaffOrders.waiting.floor"));
    // Cancelling too: the cashier may cancel a takeout order (nobody came for it), never an order at a table.
    await expect(cancelButton(till.page, "en", number)).toBeVisible();
    await expect(cancelButton(till.page, "en", tableOrder)).toHaveCount(0);
    await takeTakeoutThrough(till.page, "en", number);
    await till.context.close();
    await phone.context.close();

    // Tidy up: the owner cancels the table order and closes the table.
    await page.goto(`${site.origin}/en/staff/orders`);
    await cancelOrderOn(page, "en", tableOrder, "OTHER");
    await page.goto(`${site.origin}/en/staff/open-tables`);
    await tableCard(page, "en", name).getByRole("button", { name: t("en", "OpenTables.close"), exact: true }).click();
    await expect(tableCard(page, "en", name)).toHaveCount(0);
    await atTable.context.close();
  } finally {
    await removeTable(page, site, "en", name);
  }
});

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
