import { expect, test, type Browser, type Page } from "@playwright/test";
import { placeAnOrder } from "./support/cart";
import { jd, LOCALES, signIn, SITES, t, type Locale, type Site } from "./support/demo";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// The staff order screen. A guest places a real order at a table the test made, and staff move it along.
// The order is completed at the end (so it leaves the queue) but, like every order, it stays in the database
// until `npx supabase db reset`. The queue may hold other orders: every check looks at THIS order's card only.

/** One order's card on the staff screen, by its number (the card is named "Order 12"). */
const card = (page: Page, locale: Locale, number: number) =>
  page.getByRole("listitem", { name: t(locale, "StaffOrders.order", { number }), exact: true });

/** A member of staff on their own device: a fresh browser context, signed in, on the order screen via the dashboard card. */
async function staffAtOrders(browser: Browser, site: Site, email: string, locale: Locale) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, site, email, locale);
  await page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.ordersLink")) }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/staff/orders$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "StaffOrders.title"));
  return { context, page };
}
const refresh = (page: Page, locale: Locale) => page.getByRole("link", { name: t(locale, "StaffOrders.refresh"), exact: true }).click();

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
      const waiter = await staffAtOrders(browser, site, site.waiter, locale);
      const mine = card(waiter.page, locale, number);
      await expect(mine).toBeVisible();
      await expect(mine).toContainText(t(locale, "StaffOrders.table", { label: name }));
      await expect(mine).toContainText(m[locale]);
      await expect(mine).toContainText(jd(m.one.total, locale));
      await expect(mine).toContainText(t(locale, "StaffOrders.status.NEW"));

      // The cashier sees the same order, but its steps are the floor's: no button.
      const cashier = await staffAtOrders(browser, site, site.cashier, locale);
      const theirs = card(cashier.page, locale, number);
      await expect(theirs).toContainText(t(locale, "StaffOrders.status.NEW"));
      await expect(theirs.getByRole("button")).toHaveCount(0);
      await expect(theirs).toContainText(t(locale, "StaffOrders.waiting.floor"));

      // The waiter takes it step by step: each button moves it exactly one step and offers the next.
      for (const step of ["CONFIRMED", "PREPARING", "READY", "SERVED"] as const) {
        await mine.getByRole("button", { name: t(locale, `StaffOrders.action.${step}`), exact: true }).click();
        await expect(mine).toContainText(t(locale, `StaffOrders.status.${step}`));
      }
      // Served: completing is the cashier's, after payment.
      await expect(mine.getByRole("button")).toHaveCount(0);
      await expect(mine).toContainText(t(locale, "StaffOrders.waiting.cashier"));

      // The cashier refreshes, sees it served, and completes it: it leaves the queue for everyone.
      await refresh(cashier.page, locale);
      await expect(theirs).toContainText(t(locale, "StaffOrders.status.SERVED"));
      await theirs.getByRole("button", { name: t(locale, "StaffOrders.action.COMPLETED"), exact: true }).click();
      await expect(theirs).toHaveCount(0);
      await refresh(waiter.page, locale);
      await expect(waiter.page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "StaffOrders.title"));
      await expect(mine).toHaveCount(0);

      await waiter.context.close();
      await cashier.context.close();
    } finally {
      await removeTable(page, site, "en", name);
    }
  });

  test(`coffee /${locale}: the order screen is there and empty (no table ordering at Demo Coffee)`, async ({ browser }) => {
    const site = SITES.coffee;
    const owner = await staffAtOrders(browser, site, site.owner, locale);
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
    const mine = card(page, "en", number);
    for (const step of ["CONFIRMED", "PREPARING", "READY", "SERVED"] as const) {
      await mine.getByRole("button", { name: t("en", `StaffOrders.action.${step}`), exact: true }).click();
      await expect(mine).toContainText(t("en", `StaffOrders.status.${step}`));
    }
    await mine.getByRole("button", { name: t("en", "StaffOrders.action.COMPLETED"), exact: true }).click();
    await expect(mine).toHaveCount(0);
  } finally {
    await removeTable(page, site, "en", name);
  }
});
