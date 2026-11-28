import { expect, test, type Browser, type Page } from "@playwright/test";
import { addButton, cartBar, confirmation, dialog, menuRow, placeButton } from "./support/cart";
import { jd, LOCALES, signIn, SITES, t, type Locale } from "./support/demo";
import { guest } from "./support/tables";

// The kitchen screen (PROJECT_SPEC.md §3.3) on Demo Coffee, the coffee-shop reference, run by the owner as the one
// person at the counter: a takeout order appears as a ticket in "New" with its customer, lines, total and a running
// timer; three taps (Start, Ready, Picked up), each with a few seconds to undo, take it to completed, and the
// customer's phone shows "ready". A second order is cancelled from its ticket. Customers are called "E2E ...", and
// every order ends completed or cancelled, so nothing stays behind.

const site = SITES.coffee;
const column = (page: Page, locale: Locale, key: "new" | "making" | "ready") =>
  page.getByRole("region", { name: new RegExp(`^${t(locale, `StaffKitchen.columns.${key}`)}`) });
const ticketIn = (page: Page, locale: Locale, key: "new" | "making" | "ready", number: number) =>
  column(page, locale, key).getByRole("listitem", { name: t(locale, "StaffKitchen.order", { number }), exact: true });
const anyTicket = (page: Page, locale: Locale, number: number) => page.getByRole("listitem", { name: t(locale, "StaffKitchen.order", { number }), exact: true });
const tap = (page: Page, locale: Locale, key: "new" | "making" | "ready", number: number, button: "start" | "ready" | "pickedUp") =>
  ticketIn(page, locale, key, number).getByRole("button", { name: t(locale, `StaffKitchen.tap.${button}`), exact: true });

/** A customer orders one simple item as takeout on their own phone; the phone stays open to follow the order. */
async function takeoutOrder(browser: Browser, locale: Locale, customer: string) {
  const phone = await guest(browser);
  await phone.page.goto(`${site.origin}/${locale}/menu`);
  await addButton(menuRow(phone.page, site.menu.simple[locale]), locale).click();
  await cartBar(phone.page, locale).click();
  await dialog(phone.page).getByLabel(t(locale, "Menu.pickup.name"), { exact: true }).fill(customer);
  await dialog(phone.page).getByLabel(t(locale, "Menu.pickup.phone"), { exact: true }).fill("0791234567");
  await placeButton(phone.page, locale).click();
  return { number: await confirmation(phone.page, locale), phone };
}

for (const locale of LOCALES) {
  test(`coffee /${locale}: the counter takes a takeout order from new to picked up with three taps on the kitchen screen, each undoable`, async ({ page, browser }) => {
    const m = site.menu.simple;
    const customer = `E2E ${Math.floor(1000 + Math.random() * 9000)}`;
    const { number, phone } = await takeoutOrder(browser, locale, customer);

    // The owner opens the kitchen screen from the staff dashboard.
    await signIn(page, site, site.owner, locale);
    await page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.kitchenLink")) }).click();
    await expect(page.getByRole("heading", { level: 1, name: t(locale, "StaffKitchen.title") })).toBeVisible();

    // "New": number, customer, line, total, a green timer that ticks; the phone number is not on the board.
    const card = ticketIn(page, locale, "new", number);
    await expect(card).toContainText(t(locale, "StaffKitchen.number", { number }));
    await expect(card).toContainText(customer);
    await expect(card.getByRole("listitem").filter({ hasText: m[locale] })).toContainText("1 ×");
    await expect(card).toContainText(jd(m.pickupOne.total, locale));
    await expect(card).not.toContainText("0791234567");
    const timer = card.locator("[data-level]");
    await expect(timer).toHaveAttribute("data-level", "green");
    const first = await timer.innerText();
    await expect(timer).not.toHaveText(first, { timeout: 5000 });

    // A tap is not sent at once: Undo takes it back, and the order stays where it was.
    await tap(page, locale, "new", number, "start").click();
    await card.getByRole("button", { name: t(locale, "StaffKitchen.tap.undo"), exact: true }).click();
    await page.waitForTimeout(7000); // longer than the undo time and one refresh of the board
    await expect(tap(page, locale, "new", number, "start")).toBeVisible();

    // Start -> Making (confirmed and started in one tap), after the undo time.
    await tap(page, locale, "new", number, "start").click();
    await expect(card.getByRole("status")).toContainText(t(locale, "StaffKitchen.tap.start"));
    await expect(ticketIn(page, locale, "making", number)).toBeVisible({ timeout: 15_000 });
    await expect(ticketIn(page, locale, "new", number)).toHaveCount(0);

    // Ready -> Ready for pickup; the customer's phone says so by itself; the total is large and a waiting time shows.
    await tap(page, locale, "making", number, "ready").click();
    const ready = ticketIn(page, locale, "ready", number);
    await expect(ready).toBeVisible({ timeout: 15_000 });
    await expect(ready).toContainText(t(locale, "StaffKitchen.timer.waiting"));
    await expect(ready.locator("[data-level]")).toHaveCount(0);
    await expect(phone.page.getByRole("alert").filter({ hasText: t(locale, "Menu.orders.readyNotice", { number }) })).toBeVisible({ timeout: 20_000 });

    // Picked up (and paid at the till) -> completed: the ticket leaves the board.
    await tap(page, locale, "ready", number, "pickedUp").click();
    await expect(anyTicket(page, locale, number)).toHaveCount(0, { timeout: 15_000 });
    // The Orders screen agrees: the order is no longer open.
    await page.goto(`${site.origin}/${locale}/staff/orders`);
    await expect(page.getByText(customer)).toHaveCount(0);
    await phone.context.close();
  });

  test(`coffee /${locale}: an order is cancelled from its ticket on the kitchen screen, with a reason`, async ({ page, browser }) => {
    const customer = `E2E ${Math.floor(1000 + Math.random() * 9000)}`;
    const { number, phone } = await takeoutOrder(browser, locale, customer);
    await phone.context.close();

    await signIn(page, site, site.owner, locale);
    await page.goto(`${site.origin}/${locale}/staff/kitchen`);
    const card = ticketIn(page, locale, "new", number);
    await card.getByRole("button", { name: t(locale, "StaffOrders.cancel.open"), exact: true }).click();
    await card.getByLabel(t(locale, "StaffOrders.cancel.reasonLabel")).selectOption({ label: t(locale, "StaffOrders.cancel.reasons.NOT_COLLECTED") });
    await card.getByRole("button", { name: t(locale, "StaffOrders.cancel.confirm"), exact: true }).click();
    await expect(anyTicket(page, locale, number)).toHaveCount(0);
  });
}
