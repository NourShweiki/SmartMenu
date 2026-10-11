import { expect, test } from "@playwright/test";
import { addButton, cartBar, dialog, menuRow, placeAnOrder, placeButton } from "./support/cart";
import { jd, LOCALES, SITES, t } from "./support/demo";
import { OPEN_TABLES, refresh, staffAt, tableCard as card, takeOrderThrough } from "./support/staff";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// The staff "open tables" screen: a table's visit from the first order to closing it. The test makes its own table
// and CLOSES the visit at the end, so no live visit is left behind. Other tables may be on the screen: every check
// looks at THIS table's card only.

for (const locale of LOCALES) {
  test(`grill /${locale}: a table's visit: its bill, "ready to pay" by the waiter, closing by the cashier once everything is completed`, async ({ page, browser }) => {
    const site = SITES.grill;
    const m = site.menu.simple;
    const name = tableLabel();
    const banner = (p: typeof page) => p.getByRole("status").filter({ hasText: t(locale, "Table.banner", { label: name }) });
    await openTables(page, site, "en");
    try {
      await addTable(page, "en", name);
      const g = await guest(browser);
      await g.page.goto(await scanUrl(tableRow(page, "en", name)));
      await g.page.goto(`${site.origin}/${locale}/menu`);
      const number = await placeAnOrder(g.page, locale, m[locale]);

      // The waiter sees the table with its order and its bill, and may signal "ready to pay" but not close it.
      const waiter = await staffAt(browser, site, site.waiter, locale, OPEN_TABLES);
      const mine = card(waiter.page, locale, name);
      await expect(mine).toContainText(t(locale, "OpenTables.state.open"));
      await expect(mine).toContainText(t(locale, "OpenTables.order", { number }));
      await expect(mine).toContainText(t(locale, "StaffOrders.status.NEW"));
      await expect(mine).toContainText(jd(m.one.sub, locale));
      await expect(mine).toContainText(jd(m.one.total, locale));
      await expect(mine.getByRole("button", { name: t(locale, "OpenTables.close"), exact: true })).toHaveCount(0);

      await mine.getByRole("button", { name: t(locale, "OpenTables.requestPayment"), exact: true }).click();
      await expect(mine).toContainText(t(locale, "OpenTables.state.paymentRequested"));
      await expect(mine.getByRole("button")).toHaveCount(0); // nothing left for the waiter to do here

      // The guests can no longer order at this table: the bill is being prepared.
      await g.page.reload();
      await addButton(menuRow(g.page, m[locale]), locale).click();
      await cartBar(g.page, locale).click();
      await placeButton(g.page, locale).click();
      await expect(dialog(g.page).getByText(t(locale, "Menu.order.errors.paymentRequested"))).toBeVisible();

      // The cashier sees the bill requested, but cannot close yet: the order is not completed. No "ready to pay" for them.
      const cashier = await staffAt(browser, site, site.cashier, locale, OPEN_TABLES);
      const theirs = card(cashier.page, locale, name);
      await expect(theirs).toContainText(t(locale, "OpenTables.state.paymentRequested"));
      await expect(theirs.getByRole("button")).toHaveCount(0);
      await expect(theirs.getByRole("link", { name: t(locale, "OpenTables.goToOrders"), exact: true })).toBeVisible();

      // The owner (signed in on the first page) takes the order through to completed on the order screen.
      await page.goto(`${site.origin}/${locale}/staff/orders`);
      await takeOrderThrough(page, locale, number, ["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"]);

      // Now the cashier may close the table (after "are you sure?"): it leaves the screen, with its bill still shown until then.
      await refresh(cashier.page, locale, OPEN_TABLES);
      await expect(theirs).toContainText(t(locale, "StaffOrders.status.COMPLETED"));
      await expect(theirs).toContainText(jd(m.one.total, locale));
      cashier.page.once("dialog", (question) => question.accept());
      await theirs.getByRole("button", { name: t(locale, "OpenTables.close"), exact: true }).click();
      await expect(theirs).toHaveCount(0);
      await refresh(waiter.page, locale, OPEN_TABLES);
      await expect(mine).toHaveCount(0);

      // For the guests the visit is over: no table any more, until the code is scanned again (a new visit).
      await g.page.goto(`${site.origin}/${locale}/menu`);
      await expect(banner(g.page)).toHaveCount(0);

      await g.context.close();
      await waiter.context.close();
      await cashier.context.close();
    } finally {
      await removeTable(page, site, "en", name);
    }
  });

  test(`coffee /${locale}: the open tables screen is there and empty (no table ordering at Demo Coffee)`, async ({ browser }) => {
    const site = SITES.coffee;
    const owner = await staffAt(browser, site, site.owner, locale, OPEN_TABLES);
    await expect(owner.page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(owner.page.getByText(t(locale, "OpenTables.empty"))).toBeVisible();
    await expect(owner.page.getByRole("listitem")).toHaveCount(0);
    await owner.context.close();
  });
}

test("a table where the guests only scanned can be closed straight away, and the next scan starts a new visit", async ({ page, browser }) => {
  const site = SITES.grill;
  const name = tableLabel();
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", name);
    const url = await scanUrl(tableRow(page, "en", name));
    const g = await guest(browser);
    await g.page.goto(url);
    await expect(g.page).toHaveURL(/\/menu$/);

    await page.goto(`${site.origin}/en/staff/open-tables`); // the owner: may do both moves
    const mine = card(page, "en", name);
    await expect(mine).toContainText(t("en", "OpenTables.noOrders"));
    await expect(mine.getByRole("button", { name: t("en", "OpenTables.requestPayment"), exact: true })).toBeVisible();
    // ("Are you sure?" is answered yes on this page already: openTables set that up for the owner.)
    await mine.getByRole("button", { name: t("en", "OpenTables.close"), exact: true }).click();
    await expect(mine).toHaveCount(0);

    // The same code again: a fresh visit, back on the screen as open.
    await g.page.goto(url);
    await expect(g.page).toHaveURL(/\/menu$/);
    await page.goto(`${site.origin}/en/staff/open-tables`);
    await expect(card(page, "en", name)).toContainText(t("en", "OpenTables.state.open"));
    // Tidy up: close it again so no live visit is left behind.
    await card(page, "en", name).getByRole("button", { name: t("en", "OpenTables.close"), exact: true }).click();
    await expect(card(page, "en", name)).toHaveCount(0);
    await g.context.close();
  } finally {
    await removeTable(page, site, "en", name);
  }
});
