import { expect, type Locator, type Page } from "@playwright/test";
import { t, type Locale } from "./demo";

// Shared locators for the customer menu and its cart (used by every spec that puts something in a cart).

/** An item's row on the customer menu, by the name it is shown with. */
export const menuRow = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
export const addButton = (r: Locator, locale: Locale) => r.getByRole("button", { name: new RegExp(`^${t(locale, "Menu.add")}`) });
/** The bar at the bottom that opens the cart (only there when the cart is not empty). */
export const cartBar = (page: Page, locale: Locale) => page.getByRole("button", { name: new RegExp(t(locale, "Menu.cart.view")) });
export const dialog = (page: Page) => page.getByRole("dialog");
export const placeButton = (page: Page, locale: Locale) => dialog(page).getByRole("button", { name: t(locale, "Menu.cart.placeOrder") });

/** Reads the order number off the confirmation and closes it. */
export async function confirmation(page: Page, locale: Locale): Promise<number> {
  await expect(dialog(page).getByRole("heading", { name: t(locale, "Menu.order.title") })).toBeVisible();
  await expect(dialog(page)).toContainText(t(locale, "Menu.order.numberLabel"));
  const number = Number((await dialog(page).locator("bdi").innerText()).trim());
  expect(Number.isInteger(number) && number >= 1).toBe(true);
  await dialog(page).getByRole("button", { name: t(locale, "Menu.order.done") }).click();
  await expect(dialog(page)).toHaveCount(0);
  return number;
}

/** A guest at a table (the page is on the menu): adds one of an item, places the order, returns its number. */
export async function placeAnOrder(page: Page, locale: Locale, itemName: string): Promise<number> {
  await addButton(menuRow(page, itemName), locale).click();
  await cartBar(page, locale).click();
  await expect(placeButton(page, locale)).toBeEnabled();
  await placeButton(page, locale).click();
  return confirmation(page, locale);
}
