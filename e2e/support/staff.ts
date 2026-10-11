import { expect, type Browser, type Page } from "@playwright/test";
import { signIn, t, type Locale, type Site } from "./demo";

// Shared steps for the staff screens that work with orders and tables (Phase 5).

type Screen = { card: string; path: string; title: string };
export const ORDERS: Screen = { card: "StaffHome.ordersLink", path: "orders", title: "StaffOrders.title" };
export const OPEN_TABLES: Screen = { card: "StaffHome.openTablesLink", path: "open-tables", title: "OpenTables.title" };

/**
 * A member of staff on their own device: a fresh browser context, signed in, and on a staff screen that they reached
 * the way a person does, through its card on the dashboard.
 */
export async function staffAt(browser: Browser, site: Site, email: string, locale: Locale, screen: Screen) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, site, email, locale);
  await page.getByRole("link", { name: new RegExp(t(locale, screen.card)) }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/staff/${screen.path}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, screen.title));
  return { context, page };
}

/** The "Refresh" link of the order screen or the open tables screen (a full, fresh load of the list). */
export async function refresh(page: Page, locale: Locale, screen: Screen) {
  await page.getByRole("link", { name: t(locale, "StaffOrders.refresh"), exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, screen.title));
}

/** One order's card on the staff order screen, by its number (the card is named "Order 12"). */
export const orderCard = (page: Page, locale: Locale, number: number) =>
  page.getByRole("listitem", { name: t(locale, "StaffOrders.order", { number }), exact: true });

/** One table's card on the open tables screen, by its label (the card is named "Table 7"). */
export const tableCard = (page: Page, locale: Locale, label: string) =>
  page.getByRole("listitem", { name: t(locale, "OpenTables.table", { label }), exact: true });

export const ORDER_STEPS = ["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"] as const;

/**
 * On the order screen: presses an order's button once per step, checking after each press that the order shows
 * the new status (after COMPLETED it is gone from the queue instead).
 */
export async function takeOrderThrough(page: Page, locale: Locale, number: number, steps: readonly (typeof ORDER_STEPS)[number][]) {
  const card = orderCard(page, locale, number);
  for (const step of steps) {
    await card.getByRole("button", { name: t(locale, `StaffOrders.action.${step}`), exact: true }).click();
    if (step === "COMPLETED") await expect(card).toHaveCount(0);
    else await expect(card).toContainText(t(locale, `StaffOrders.status.${step}`));
  }
}

export type CancelReason = "GUEST_CHANGED_MIND" | "ITEM_UNAVAILABLE" | "MISTAKE" | "OTHER";
export const cancelButton = (page: Page, locale: Locale, number: number) =>
  orderCard(page, locale, number).getByRole("button", { name: t(locale, "StaffOrders.cancel.open"), exact: true });

/** On the order screen: opens "Cancel order" on a card, picks the reason and confirms; the order leaves the queue. */
export async function cancelOrderOn(page: Page, locale: Locale, number: number, reason: CancelReason) {
  const card = orderCard(page, locale, number);
  await cancelButton(page, locale, number).click();
  await card.getByLabel(t(locale, "StaffOrders.cancel.reasonLabel")).selectOption({ label: t(locale, `StaffOrders.cancel.reasons.${reason}`) });
  await card.getByRole("button", { name: t(locale, "StaffOrders.cancel.confirm"), exact: true }).click();
  await expect(card).toHaveCount(0);
}
