import { expect, test, type Page } from "@playwright/test";
import { addButton, cartBar, confirmation, dialog, menuRow, placeButton } from "./support/cart";
import { jd, LOCALES, signIn, SITES, t, type Locale } from "./support/demo";
import { cancelOrderOn, orderCard, takeOrderThrough } from "./support/staff";
import { guest } from "./support/tables";

// The kitchen screen (PROJECT_SPEC.md §3.3) on Demo Coffee, the coffee-shop reference: a takeout order appears as a
// ticket in "New" with its customer, lines, total and a running timer, and moves to "Making" and "Ready for pickup"
// with its status. (The board's own buttons come with step 1d; here the Orders screen moves the order.) The customer
// is called "E2E ...", and the order is cancelled at the end, so nothing stays behind.

const site = SITES.coffee;
const column = (page: Page, locale: Locale, key: "new" | "making" | "ready") =>
  page.getByRole("region", { name: new RegExp(`^${t(locale, `StaffKitchen.columns.${key}`)}`) });
const ticket = (page: Page, locale: Locale, number: number) => page.getByRole("listitem", { name: t(locale, "StaffKitchen.order", { number }), exact: true });

for (const locale of LOCALES) {
  test(`coffee /${locale}: a takeout order shows on the kitchen screen as a ticket with a timer, in the column of its status`, async ({ page, browser }) => {
    const m = site.menu.simple;
    const customer = `E2E ${Math.floor(1000 + Math.random() * 9000)}`;

    // A customer orders takeout on their phone.
    const phone = await guest(browser);
    await phone.page.goto(`${site.origin}/${locale}/menu`);
    await addButton(menuRow(phone.page, m[locale]), locale).click();
    await cartBar(phone.page, locale).click();
    await dialog(phone.page).getByLabel(t(locale, "Menu.pickup.name"), { exact: true }).fill(customer);
    await dialog(phone.page).getByLabel(t(locale, "Menu.pickup.phone"), { exact: true }).fill("0791234567");
    await placeButton(phone.page, locale).click();
    const number = await confirmation(phone.page, locale);
    await phone.context.close();

    // The owner opens the kitchen screen from the staff dashboard.
    await signIn(page, site, site.owner, locale);
    await page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.kitchenLink")) }).click();
    await expect(page.getByRole("heading", { level: 1, name: t(locale, "StaffKitchen.title") })).toBeVisible();

    // "New": number, customer, line, total, a green timer that ticks; the phone number is not on the board.
    const card = column(page, locale, "new").getByRole("listitem", { name: t(locale, "StaffKitchen.order", { number }), exact: true });
    await expect(card).toContainText(t(locale, "StaffKitchen.number", { number }));
    await expect(card).toContainText(customer);
    await expect(card.getByRole("listitem").filter({ hasText: m[locale] })).toContainText("1 ×");
    await expect(card).toContainText(jd(m.pickupOne.total, locale));
    await expect(card).not.toContainText("0791234567");
    const timer = card.locator("[data-level]");
    await expect(timer).toHaveAttribute("data-level", "green");
    const first = await timer.innerText();
    await expect(timer).not.toHaveText(first, { timeout: 5000 });

    // Its status moves (on the Orders screen for now): the ticket follows, oldest-first columns.
    await page.goto(`${site.origin}/${locale}/staff/orders`);
    await takeOrderThrough(page, locale, number, ["CONFIRMED", "PREPARING"]);
    await page.goto(`${site.origin}/${locale}/staff/kitchen`);
    await expect(column(page, locale, "making").getByRole("listitem", { name: t(locale, "StaffKitchen.order", { number }), exact: true })).toBeVisible();
    await expect(column(page, locale, "new").getByRole("listitem", { name: t(locale, "StaffKitchen.order", { number }), exact: true })).toHaveCount(0);

    await page.goto(`${site.origin}/${locale}/staff/orders`);
    await takeOrderThrough(page, locale, number, ["READY"]);
    await page.goto(`${site.origin}/${locale}/staff/kitchen`);
    const ready = column(page, locale, "ready").getByRole("listitem", { name: t(locale, "StaffKitchen.order", { number }), exact: true });
    await expect(ready).toContainText(t(locale, "StaffKitchen.timer.waiting"));
    await expect(ready.locator("[data-level]")).toHaveCount(0); // waiting for pickup: no colour

    // Tidy up: the order is cancelled and leaves the board.
    await page.goto(`${site.origin}/${locale}/staff/orders`);
    await expect(orderCard(page, locale, number)).toBeVisible();
    await cancelOrderOn(page, locale, number, "OTHER");
    await page.goto(`${site.origin}/${locale}/staff/kitchen`);
    await expect(ticket(page, locale, number)).toHaveCount(0);
  });
}
