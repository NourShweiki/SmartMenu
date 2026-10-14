import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, expectLocale, LOCALES, SITES, t, type Locale, type Site } from "./support/demo";
import { addTable, guest, openTables, removeTable, scanUrl, tableLabel, tableRow } from "./support/tables";

// The restaurant's home page offers three ways in: the smart assistant, the menu, and the services (waiter, cleaning, bill).
// Services need tables, so a takeout-only restaurant (Demo Coffee) does not offer them. The AI behind the assistant is
// the scripted stand-in of the browser tests (playwright.config.ts), so the assistant is switched on for both.

const option = (page: Page, locale: Locale, key: "assistant" | "menu" | "services") =>
  page.getByRole("link", { name: new RegExp(`^${t(locale, `Home.options.${key}.title`)}`) });
const home = async (page: Page, site: Site, locale: Locale) => {
  await page.goto(`${site.origin}/${locale}`);
  await expectLocale(page, locale);
};

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the home page offers the smart assistant and the menu${site.tables.dineIn ? ", and services" : " (no services: no tables here)"}`, async ({ page }) => {
      await home(page, site, locale);
      await expect(page.getByRole("navigation", { name: t(locale, "Home.optionsLabel"), exact: true })).toBeVisible();
      await expect(option(page, locale, "assistant")).toHaveAttribute("href", `/${locale}/menu?assistant=1`);
      await expect(option(page, locale, "menu")).toHaveAttribute("href", `/${locale}/menu`);
      if (site.tables.dineIn) {
        await expect(option(page, locale, "services")).toHaveAttribute("href", `/${locale}/services`);
        // Nobody scanned a table here: the card says so.
        await expect(option(page, locale, "services")).toContainText(t(locale, "Home.options.services.needTable"));
      } else {
        await expect(option(page, locale, "services")).toHaveCount(0);
      }
      // The assistant comes first.
      await expect(page.getByRole("navigation").getByRole("link").first()).toContainText(t(locale, "Home.options.assistant.title"));
    });

    test(`${site.key} /${locale}: the assistant card opens the menu with the chat already open`, async ({ page }) => {
      await home(page, site, locale);
      await option(page, locale, "assistant").click();
      await expect(page.getByRole("dialog", { name: t(locale, "Menu.assistant.title"), exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${locale}/menu$`)); // the ?assistant=1 is taken out of the address: a reload does not reopen it
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Menu.title"));
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test(`${site.key} /${locale}: the menu card opens the plain menu`, async ({ page }) => {
      await home(page, site, locale);
      await option(page, locale, "menu").click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/menu$`));
      await expect(page.getByRole("dialog")).toHaveCount(0); // no chat unless asked for
    });
  }
}

for (const locale of LOCALES) {
  test(`grill /${locale}: the services card leads to the services page, which asks a guest without a table to scan`, async ({ page }) => {
    await home(page, SITES.grill, locale);
    await option(page, locale, "services").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/services$`));
    await expect(page.getByRole("heading", { name: t(locale, "Services.needTableTitle"), exact: true })).toBeVisible();
  });
}

test("grill: a guest who scanned a table no longer sees the 'scan first' note, and the services card opens the three services", async ({ page, browser }) => {
  const site = SITES.grill;
  const name = tableLabel();
  await openTables(page, site, "en");
  try {
    await addTable(page, "en", name);
    const g = await guest(browser);
    await g.page.goto(await scanUrl(tableRow(page, "en", name)));
    await home(g.page, site, "en");
    await expect(option(g.page, "en", "services")).toBeVisible();
    await expect(option(g.page, "en", "services")).not.toContainText(t("en", "Home.options.services.needTable"));
    await option(g.page, "en", "services").click();
    await expect(g.page.getByRole("status").filter({ hasText: t("en", "Table.banner", { label: name }) })).toBeVisible();
    await expect(g.page.getByRole("region", { name: t("en", "Services.kinds.CALL_WAITER.title"), exact: true })).toBeVisible();
    await g.context.close();
  } finally {
    await removeTable(page, site, "en", name);
  }
});
