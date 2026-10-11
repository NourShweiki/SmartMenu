import { expect, test, type Page } from "@playwright/test";
import { placeAnOrder } from "./support/cart";
import { jd, LOCALES, SITES, t, type Locale } from "./support/demo";
import { cancelOrderOn, tableCard, takeOrderThrough } from "./support/staff";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// The guests' side of an order: "your orders" on the menu page of the phones at the table, kept up to date by
// itself, with the notice when an order is ready and when one is cancelled. Each test makes its own table and
// closes the visit at the end. (The sound, the vibration and the system notification cannot be tested here.)

const yourOrders = (page: Page, locale: Locale) => page.getByRole("region", { name: t(locale, "Menu.orders.title") });
const mine = (page: Page, locale: Locale, number: number) =>
  yourOrders(page, locale).getByRole("listitem", { name: t(locale, "Menu.orders.order", { number }), exact: true });

for (const locale of LOCALES) {
  test(`grill /${locale}: guests follow their orders on their phone: received, ready (with a notice), cancelled (with a notice)`, async ({ page, browser }) => {
    const site = SITES.grill;
    const m = site.menu.simple;
    const name = tableLabel();
    await openTables(page, site, "en");
    try {
      await addTable(page, "en", name);
      const url = await scanUrl(tableRow(page, "en", name));
      const g = await guest(browser);
      await g.page.goto(url);
      await g.page.goto(`${site.origin}/${locale}/menu`);
      await expect(yourOrders(g.page, locale)).toHaveCount(0); // nothing ordered yet: no such section

      // Two orders. Both show up under "your orders" straight after being placed, as received.
      const first = await placeAnOrder(g.page, locale, m[locale]);
      await expect(mine(g.page, locale, first)).toContainText(t(locale, "Menu.orders.status.NEW"));
      await expect(mine(g.page, locale, first)).toContainText(m[locale]);
      await expect(mine(g.page, locale, first)).toContainText(jd(m.one.total, locale));
      const second = await placeAnOrder(g.page, locale, m[locale]);
      await expect(mine(g.page, locale, second)).toContainText(t(locale, "Menu.orders.status.NEW"));

      // A second phone at the same table sees the same orders (it joined the same visit).
      const friend = await guest(browser);
      await friend.page.goto(url);
      await friend.page.goto(`${site.origin}/${locale}/menu`);
      await expect(mine(friend.page, locale, first)).toBeVisible();
      await expect(mine(friend.page, locale, second)).toBeVisible();

      // Staff take the first order to "ready" (the owner, on the order screen). Nobody touches the guests' phones:
      // the status follows, and the notice appears, on both.
      await page.goto(`${site.origin}/${locale}/staff/orders`);
      await takeOrderThrough(page, locale, first, ["CONFIRMED", "PREPARING", "READY"]);
      const ready = t(locale, "Menu.orders.readyNotice", { number: first });
      for (const phone of [g.page, friend.page]) {
        await expect(phone.getByRole("alert").filter({ hasText: ready })).toBeVisible();
        await expect(mine(phone, locale, first)).toContainText(t(locale, "Menu.orders.status.READY"));
      }
      // The notice stays until the guest dismisses it.
      await g.page.getByRole("alert").filter({ hasText: ready }).getByRole("button", { name: t(locale, "Menu.orders.dismiss"), exact: true }).click();
      await expect(g.page.getByRole("alert").filter({ hasText: ready })).toHaveCount(0);

      // Staff cancel the second order: the guests are told, and it is crossed out as cancelled.
      await cancelOrderOn(page, locale, second, "ITEM_UNAVAILABLE");
      await expect(g.page.getByRole("alert").filter({ hasText: t(locale, "Menu.orders.cancelledNotice", { number: second }) })).toBeVisible();
      await expect(mine(g.page, locale, second)).toContainText(t(locale, "Menu.orders.status.CANCELLED"));

      // Reloading does not announce old news again.
      await g.page.reload();
      await expect(mine(g.page, locale, first)).toContainText(t(locale, "Menu.orders.status.READY"));
      await expect(yourOrders(g.page, locale).getByRole("alert")).toHaveCount(0);

      // Tidy up: complete the first order, close the table. With the visit over, the guests' page shows no orders.
      await takeOrderThrough(page, locale, first, ["SERVED", "COMPLETED"]);
      await page.goto(`${site.origin}/${locale}/staff/open-tables`);
      await tableCard(page, locale, name).getByRole("button", { name: t(locale, "OpenTables.close"), exact: true }).click();
      await expect(tableCard(page, locale, name)).toHaveCount(0);
      await g.page.reload();
      await expect(yourOrders(g.page, locale)).toHaveCount(0);

      await g.context.close();
      await friend.context.close();
    } finally {
      await removeTable(page, site, "en", name);
    }
  });
}

test("a visitor without a table has no orders section, and one table never sees another table's orders", async ({ page, browser }) => {
  const site = SITES.grill;
  const [nameA, nameB] = [tableLabel(), tableLabel() + " B"];
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", nameA);
    await addTable(page, "en", nameB);
    const a = await guest(browser);
    await a.page.goto(await scanUrl(tableRow(page, "en", nameA)));
    await a.page.goto(`${site.origin}/en/menu`);
    const number = await placeAnOrder(a.page, "en", site.menu.simple.en);
    await expect(mine(a.page, "en", number)).toBeVisible();

    // Another table's phone: its own (empty) visit, nothing of table A's.
    const b = await guest(browser);
    await b.page.goto(await scanUrl(tableRow(page, "en", nameB)));
    await b.page.goto(`${site.origin}/en/menu`);
    await expect(yourOrders(b.page, "en")).toHaveCount(0);
    // Somebody who never scanned a code.
    const nobody = await guest(browser);
    await nobody.page.goto(`${site.origin}/en/menu`);
    await expect(yourOrders(nobody.page, "en")).toHaveCount(0);

    // Tidy up: cancel the order, close both visits.
    await page.goto(`${site.origin}/en/staff/orders`);
    await cancelOrderOn(page, "en", number, "OTHER");
    await page.goto(`${site.origin}/en/staff/open-tables`);
    for (const name of [nameA, nameB]) {
      await tableCard(page, "en", name).getByRole("button", { name: t("en", "OpenTables.close"), exact: true }).click();
      await expect(tableCard(page, "en", name)).toHaveCount(0);
    }
    for (const phone of [a, b, nobody]) await phone.context.close();
  } finally {
    await removeTable(page, site, "en", nameB);
    await removeTable(page, site, "en", nameA);
  }
});
