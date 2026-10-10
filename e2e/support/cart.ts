import type { Locator, Page } from "@playwright/test";
import { t, type Locale } from "./demo";

// Shared locators for the customer menu and its cart (used by every spec that puts something in a cart).

/** An item's row on the customer menu, by the name it is shown with. */
export const menuRow = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });
export const addButton = (r: Locator, locale: Locale) => r.getByRole("button", { name: new RegExp(`^${t(locale, "Menu.add")}`) });
/** The bar at the bottom that opens the cart (only there when the cart is not empty). */
export const cartBar = (page: Page, locale: Locale) => page.getByRole("button", { name: new RegExp(t(locale, "Menu.cart.view")) });
export const dialog = (page: Page) => page.getByRole("dialog");
