import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, LOCALES, signIn, SITES, t, type Locale } from "./support/demo";

// The owner's setup checklist on the staff dashboard: what the restaurant still needs before its first order. It is
// worked out from what the restaurant has, so these tests only read it. The demo restaurants (supabase/seed.sql)
// have a menu and no branding or orders; Demo Grill also has tables and staff, Demo Coffee (takeout only) neither.

const card = (page: Page, locale: Locale) => page.getByRole("region", { name: t(locale, "StaffHome.setup.title") });
const line = (page: Page, locale: Locale, id: string) => card(page, locale).getByRole("listitem").filter({ hasText: t(locale, `StaffHome.setup.items.${id}`) });

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the owner's dashboard says what is still missing, with a link to fix each thing`, async ({ page }) => {
      await signIn(page, site, site.owner, locale);
      await expect(card(page, locale)).toBeVisible();

      // Done: the menu has items. Not a link any more, marked done.
      await expect(line(page, locale, "menu")).toContainText(t(locale, "StaffHome.setup.done"));
      await expect(line(page, locale, "menu").getByRole("link")).toHaveCount(0);

      // Tables and QR codes only where the restaurant takes orders at its tables.
      if (site.tables.dineIn) await expect(line(page, locale, "tables")).toContainText(t(locale, "StaffHome.setup.done"));
      else await expect(line(page, locale, "tables")).toHaveCount(0);

      // Staff: done where there is a waiter; otherwise open, but only "optional".
      await expect(line(page, locale, "staff")).toContainText(t(locale, site.waiter ? "StaffHome.setup.done" : "StaffHome.setup.optional"));

      // Still to do, with its way there: branding. (Nothing in the tests ever sets a logo or details.)
      await expect(line(page, locale, "branding")).toContainText(t(locale, "StaffHome.setup.todo"));
      // A test order: open, with a link to the public menu, unless an order exists at this moment (other specs of
      // the same run place orders on the demo restaurants and remove them at the end): then it is ticked.
      const testOrder = line(page, locale, "testOrder");
      await expect(testOrder).toBeVisible();
      if (await testOrder.getByRole("link").count()) await expect(testOrder.getByRole("link")).toHaveAttribute("href", `/${locale}/menu`);
      else await expect(testOrder).toContainText(t(locale, "StaffHome.setup.done"));
      await line(page, locale, "branding").getByRole("link").click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/branding$`));
    });
  }
}

test("the checklist is the owner's: a waiter and a cashier do not see it", async ({ page }) => {
  const site = SITES.grill;
  for (const email of [site.waiter, site.cashier]) {
    await signIn(page, site, email, "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "StaffHome.title"));
    await expect(card(page, "en")).toHaveCount(0);
    await page.getByRole("button", { name: t("en", "StaffHome.signOut") }).click();
    await expect(page).toHaveURL(/\/en\/staff\/login$/);
  }
});
