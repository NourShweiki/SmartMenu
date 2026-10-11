import { expect, test } from "@playwright/test";
import { placeAnOrder } from "./support/cart";
import { jd, LOCALES, SITES, t } from "./support/demo";
import { cancelButton, cancelOrderOn, orderCard as card, ORDERS, refresh, staffAt, tableCard, takeOrderThrough } from "./support/staff";
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

  test(`grill /${locale}: the waiter cancels a new order with a reason; it leaves the queue, is crossed out at zero on the bill, and the table can be closed`, async ({ page, browser }) => {
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

      const waiter = await staffAt(browser, site, site.waiter, locale, ORDERS);
      const mine = card(waiter.page, locale, number);
      // The first press only opens the question; "Keep the order" closes it again and nothing happened.
      await cancelButton(waiter.page, locale, number).click();
      await expect(mine.getByLabel(t(locale, "StaffOrders.cancel.reasonLabel"))).toBeVisible();
      await mine.getByRole("button", { name: t(locale, "StaffOrders.cancel.keep"), exact: true }).click();
      await expect(mine.getByLabel(t(locale, "StaffOrders.cancel.reasonLabel"))).toHaveCount(0);
      await expect(mine).toContainText(t(locale, "StaffOrders.status.NEW"));
      // With a reason, it is cancelled and leaves the queue.
      await cancelOrderOn(waiter.page, locale, number, "ITEM_UNAVAILABLE");
      await refresh(waiter.page, locale, ORDERS);
      await expect(mine).toHaveCount(0);
      await waiter.context.close();

      // On the table's bill the order is still listed, as cancelled, and nothing is owed.
      await page.goto(`${site.origin}/${locale}/staff/open-tables`); // the owner, signed in on this page
      const table = tableCard(page, locale, name);
      await expect(table).toContainText(t(locale, "OpenTables.order", { number }));
      await expect(table).toContainText(t(locale, "StaffOrders.status.CANCELLED"));
      await expect(table.locator("dl")).toContainText(jd(0, locale));
      await expect(table.locator("dl")).not.toContainText(jd(m.one.total, locale));
      // Nothing unfinished is left: the table can be closed ("are you sure?" is answered yes on the owner's page).
      await table.getByRole("button", { name: t(locale, "OpenTables.close"), exact: true }).click();
      await expect(table).toHaveCount(0);
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

test("who may cancel: the cashier never, the waiter only before the kitchen starts, the owner also after", async ({ page, browser }) => {
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

    const cashier = await staffAt(browser, site, site.cashier, "en", ORDERS);
    await expect(card(cashier.page, "en", number)).toBeVisible();
    await expect(cancelButton(cashier.page, "en", number)).toHaveCount(0);
    await cashier.context.close();

    const waiter = await staffAt(browser, site, site.waiter, "en", ORDERS);
    await expect(cancelButton(waiter.page, "en", number)).toBeVisible(); // new
    await takeOrderThrough(waiter.page, "en", number, ["CONFIRMED"]);
    await expect(cancelButton(waiter.page, "en", number)).toBeVisible(); // confirmed: still before the kitchen
    await takeOrderThrough(waiter.page, "en", number, ["PREPARING"]);
    await expect(cancelButton(waiter.page, "en", number)).toHaveCount(0); // the kitchen has started
    await waiter.context.close();

    await page.goto(`${site.origin}/en/staff/orders`); // the owner
    await expect(card(page, "en", number)).toContainText(t("en", "StaffOrders.status.PREPARING"));
    await cancelOrderOn(page, "en", number, "MISTAKE");

    // Tidy up: the table has nothing unfinished now, close its visit.
    await page.goto(`${site.origin}/en/staff/open-tables`);
    await tableCard(page, "en", name).getByRole("button", { name: t("en", "OpenTables.close"), exact: true }).click();
    await expect(tableCard(page, "en", name)).toHaveCount(0);
  } finally {
    await removeTable(page, site, "en", name);
  }
});

test("a new order appears on an open order screen by itself, with a notice; the sound switch is remembered", async ({ page, browser }) => {
  const site = SITES.grill;
  const name = tableLabel();
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", name);
    const g = await guest(browser);
    await g.page.goto(await scanUrl(tableRow(page, "en", name)));
    await g.page.goto(`${site.origin}/en/menu`);

    // The waiter has the screen open BEFORE anything is ordered, and switches the sound on.
    const waiter = await staffAt(browser, site, site.waiter, "en", ORDERS);
    const soundOff = waiter.page.getByRole("button", { name: t("en", "StaffOrders.live.turnSoundOn"), exact: true });
    const soundOn = waiter.page.getByRole("button", { name: t("en", "StaffOrders.live.turnSoundOff"), exact: true });
    await expect(soundOff).toHaveAttribute("aria-pressed", "false");
    await soundOff.click();
    await expect(soundOn).toHaveAttribute("aria-pressed", "true");

    // The guest orders. Nobody touches the waiter's screen: the notice and the order show up on their own.
    const number = await placeAnOrder(g.page, "en", site.menu.simple.en);
    await g.context.close();
    await expect(waiter.page.getByRole("status").filter({ hasText: "New order" })).toBeVisible();
    await expect(card(waiter.page, "en", number)).toContainText(t("en", "StaffOrders.table", { label: name }));

    // After a reload the sound is still on; the browser wants one touch of the page before it plays again, and says so.
    await waiter.page.reload();
    await expect(soundOn).toHaveAttribute("aria-pressed", "true");
    await expect(waiter.page.getByText(t("en", "StaffOrders.live.soundBlocked"))).toBeVisible();
    await waiter.page.getByRole("heading", { level: 1 }).click();
    await expect(waiter.page.getByText(t("en", "StaffOrders.live.soundBlocked"))).toHaveCount(0);

    // Someone else moves the order: this screen follows without a refresh either.
    await page.goto(`${site.origin}/en/staff/orders`); // the owner
    await takeOrderThrough(page, "en", number, ["CONFIRMED"]);
    await expect(card(waiter.page, "en", number)).toContainText(t("en", "StaffOrders.status.CONFIRMED"));
    await waiter.context.close();

    // Tidy up: cancel the order and close the table's visit.
    await cancelOrderOn(page, "en", number, "OTHER");
    await page.goto(`${site.origin}/en/staff/open-tables`);
    await tableCard(page, "en", name).getByRole("button", { name: t("en", "OpenTables.close"), exact: true }).click();
    await expect(tableCard(page, "en", name)).toHaveCount(0);
  } finally {
    await removeTable(page, site, "en", name);
  }
});
