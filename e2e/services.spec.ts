import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, expectLocale, LOCALES, SITES, t, type Locale } from "./support/demo";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// Services for a guest at a table: call the waiter, clean the table, ask for the bill. Each test that needs a table adds
// its own ("E2E ...") and deletes it again; e2e/support/global-cleanup.ts removes the requests and visits it leaves.
// The waiter's side (seeing and resolving them) is tested with the waiter's screen.

const KINDS = ["CALL_WAITER", "CLEAN_TABLE", "REQUEST_BILL"] as const;
const card = (page: Page, locale: Locale, kind: (typeof KINDS)[number]) => page.getByRole("region", { name: t(locale, `Services.kinds.${kind}.title`), exact: true });
const press = (page: Page, locale: Locale, kind: (typeof KINDS)[number]) =>
  card(page, locale, kind).getByRole("button", { name: new RegExp(`^${t(locale, "Services.request")}`) });

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: with no table scanned the page says to scan, and offers no buttons`, async ({ page }) => {
      await page.goto(`${site.origin}/${locale}/services`);
      await expectLocale(page, locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Services.title"));
      await expect(page.getByRole("heading", { name: t(locale, "Services.needTableTitle"), exact: true })).toBeVisible();
      await expect(page.getByText(t(locale, "Services.needTable"))).toBeVisible();
      for (const kind of KINDS) await expect(card(page, locale, kind)).toHaveCount(0);
      // The way back to the menu works.
      await page.getByRole("link", { name: t(locale, "Services.toMenu"), exact: true }).last().click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/menu$`));
    });
  }
}

for (const locale of LOCALES) {
  test(`grill /${locale}: a guest at a table calls the waiter; it shows as waiting, cannot be pressed twice, and survives a reload`, async ({ page, browser }) => {
    const site = SITES.grill;
    const name = tableLabel();
    await openTables(page, site, "en");
    try {
      await addTable(page, "en", name);
      const g = await guest(browser);
      await g.page.goto(await scanUrl(tableRow(page, "en", name)));
      await expect(g.page).toHaveURL(/\/menu$/);

      // The menu offers the way in for guests at a table.
      await g.page.goto(`${site.origin}/${locale}/menu`);
      await g.page.getByRole("link", { name: t(locale, "Menu.servicesLink"), exact: true }).click();
      await expect(g.page).toHaveURL(new RegExp(`/${locale}/services$`));
      await expectLocale(g.page, locale);
      await expect(g.page.getByRole("status").filter({ hasText: t(locale, "Table.banner", { label: name }) })).toBeVisible();
      for (const kind of KINDS) await expect(press(g.page, locale, kind)).toBeEnabled();

      // Calling the waiter: the card turns into "on its way" and the button is gone (no second press).
      await press(g.page, locale, "CALL_WAITER").click();
      await expect(card(g.page, locale, "CALL_WAITER").getByText(t(locale, "Services.kinds.CALL_WAITER.waiting"))).toBeVisible();
      await expect(press(g.page, locale, "CALL_WAITER")).toHaveCount(0);
      // The other two are separate requests and still available.
      await expect(press(g.page, locale, "CLEAN_TABLE")).toBeEnabled();
      await expect(press(g.page, locale, "REQUEST_BILL")).toBeEnabled();

      // It is stored: after a reload it still says waiting (the page reads it from the database).
      await g.page.reload();
      await expect(card(g.page, locale, "CALL_WAITER").getByText(t(locale, "Services.kinds.CALL_WAITER.waiting"))).toBeVisible();

      // Cleaning and the bill work too.
      await press(g.page, locale, "CLEAN_TABLE").click();
      await expect(card(g.page, locale, "CLEAN_TABLE").getByText(t(locale, "Services.kinds.CLEAN_TABLE.waiting"))).toBeVisible();
      await press(g.page, locale, "REQUEST_BILL").click();
      await expect(card(g.page, locale, "REQUEST_BILL").getByText(t(locale, "Services.kinds.REQUEST_BILL.waiting"))).toBeVisible();
      await g.context.close();
    } finally {
      await removeTable(page, site, "en", name);
    }
  });
}

test("a second phone at the same table sees what the first one asked for, and cannot ask for it again", async ({ page, browser }) => {
  const site = SITES.grill;
  const name = tableLabel();
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", name);
    const link = await scanUrl(tableRow(page, "en", name));
    const first = await guest(browser);
    await first.page.goto(link);
    await first.page.goto(`${site.origin}/en/services`);
    await press(first.page, "en", "CLEAN_TABLE").click();
    await expect(card(first.page, "en", "CLEAN_TABLE").getByText(t("en", "Services.kinds.CLEAN_TABLE.waiting"))).toBeVisible();

    // Another phone scans the same table: it joins the same visit, so the same request is already waiting there.
    const second = await guest(browser);
    await second.page.goto(link);
    await second.page.goto(`${site.origin}/en/services`);
    await expect(card(second.page, "en", "CLEAN_TABLE").getByText(t("en", "Services.kinds.CLEAN_TABLE.waiting"))).toBeVisible();
    await expect(press(second.page, "en", "CLEAN_TABLE")).toHaveCount(0);
    await expect(press(second.page, "en", "CALL_WAITER")).toBeEnabled();
    await first.context.close();
    await second.context.close();
  } finally {
    await removeTable(page, site, "en", name);
  }
});

test("coffee: dine-in is off, so a guest has no table and the page says to scan", async ({ page }) => {
  const site = SITES.coffee;
  await page.goto(`${site.origin}/t/${site.tables.token}`); // not active: no visit starts
  await page.goto(`${site.origin}/en/services`);
  await expect(page.getByRole("heading", { name: t("en", "Services.needTableTitle"), exact: true })).toBeVisible();
});
