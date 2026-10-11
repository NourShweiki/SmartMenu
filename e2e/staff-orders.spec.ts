import { expect, test } from "@playwright/test";
import { placeAnOrder } from "./support/cart";
import { jd, LOCALES, SITES, t } from "./support/demo";
import { orderCard as card, ORDERS, refresh, staffAt, takeOrderThrough } from "./support/staff";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// The staff order screen. A guest places a real order at a table the test made, and staff move it along.
// The order is completed at the end (so it leaves the queue) but, like every order, it stays in the database
// until `npx supabase db reset`. The queue may hold other orders: every check looks at THIS order's card only.

for (const locale of LOCALES) {
  test(`grill /${locale}: an order placed at a table reaches the staff screen; the waiter serves it, the cashier completes it`, async ({ page, browser }) => {
    const site = SITES.grill;
    const m = site.menu.simple;
    const name = tableLabel();
    await openTables(page, site, "en");
    try {
      await addTable(page, "en", name);
      const g = await guest(browser);
      await g.page.goto(await scanUrl(tableRow(page, "en", name)));
      await g.page.goto(`${site.origin}/${locale}/menu`);
      const number = await placeAnOrder(g.page, locale, m[locale]);
      await g.context.close();

      // The waiter sees it: number, table, what was ordered, the total, and its first step.
      const waiter = await staffAt(browser, site, site.waiter, locale, ORDERS);
      const mine = card(waiter.page, locale, number);
      await expect(mine).toBeVisible();
      await expect(mine).toContainText(t(locale, "StaffOrders.table", { label: name }));
      await expect(mine).toContainText(m[locale]);
      await expect(mine).toContainText(jd(m.one.total, locale));
      await expect(mine).toContainText(t(locale, "StaffOrders.status.NEW"));

      // The cashier sees the same order, but its steps are the floor's: no button.
      const cashier = await staffAt(browser, site, site.cashier, locale, ORDERS);
      const theirs = card(cashier.page, locale, number);
      await expect(theirs).toContainText(t(locale, "StaffOrders.status.NEW"));
      await expect(theirs.getByRole("button")).toHaveCount(0);
      await expect(theirs).toContainText(t(locale, "StaffOrders.waiting.floor"));

      // The waiter takes it step by step: each button moves it exactly one step and offers the next.
      await takeOrderThrough(waiter.page, locale, number, ["CONFIRMED", "PREPARING", "READY", "SERVED"]);
      // Served: completing is the cashier's, after payment.
      await expect(mine.getByRole("button")).toHaveCount(0);
      await expect(mine).toContainText(t(locale, "StaffOrders.waiting.cashier"));

      // The cashier refreshes, sees it served, and completes it: it leaves the queue for everyone.
      await refresh(cashier.page, locale, ORDERS);
      await expect(theirs).toContainText(t(locale, "StaffOrders.status.SERVED"));
      await takeOrderThrough(cashier.page, locale, number, ["COMPLETED"]);
      await refresh(waiter.page, locale, ORDERS);
      await expect(mine).toHaveCount(0);

      await waiter.context.close();
      await cashier.context.close();
    } finally {
      await removeTable(page, site, "en", name);
    }
  });

  test(`coffee /${locale}: the order screen is there and empty (no table ordering at Demo Coffee)`, async ({ browser }) => {
    const site = SITES.coffee;
    const owner = await staffAt(browser, site, site.owner, locale, ORDERS);
    await expect(owner.page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(owner.page.getByText(t(locale, "StaffOrders.empty"))).toBeVisible();
    await expect(owner.page.getByRole("listitem")).toHaveCount(0);
    await owner.context.close();
  });
}

test("the owner can take an order through every step alone, including completing it", async ({ page, browser }) => {
  const site = SITES.grill;
  const name = tableLabel();
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", name);
    const g = await guest(browser);
    await g.page.goto(await scanUrl(tableRow(page, "en", name)));
    await g.page.goto(`${site.origin}/en/menu`);
    const number = await placeAnOrder(g.page, "en", site.menu.simple.en);
    await g.context.close();

    await page.goto(`${site.origin}/en/staff/orders`); // the owner is signed in on this page already
    await takeOrderThrough(page, "en", number, ["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"]);
  } finally {
    await removeTable(page, site, "en", name);
  }
});
