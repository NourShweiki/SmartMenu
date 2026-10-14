import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, expectLocale, jd, LOCALES, t, type Locale, type Site } from "./support/demo";
import { cartBar, dialog } from "./support/cart";

// The AI ordering assistant on the customer menu: both restaurants, both languages. The AI service is a scripted
// stand-in (e2e/support/fake-gemini.mjs): no real key is used and no real model is called, so the tests are free and
// always give the same answers. What is tested here is OUR side: that the chat opens, what is sent, that only checked
// lines reach the cart (priced by the app, not the AI), and that failures are shown kindly.

const open = async (page: Page, site: Site, locale: Locale) => {
  await page.goto(`${site.origin}/${locale}/menu`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Menu.title"));
};
const chat = (page: Page, locale: Locale) => page.getByRole("dialog", { name: t(locale, "Menu.assistant.title"), exact: true });

/** The way the home page's "Smart assistant" card opens it: the menu page with `?assistant=1` (the plain menu has no assistant). */
async function openChat(page: Page, locale: Locale) {
  await page.goto(`${new URL(page.url()).origin}/${locale}/menu?assistant=1`);
  await expect(chat(page, locale)).toBeVisible();
}
async function say(page: Page, locale: Locale, text: string) {
  await chat(page, locale).getByLabel(t(locale, "Menu.assistant.placeholder"), { exact: true }).fill(text);
  await chat(page, locale).getByRole("button", { name: t(locale, "Menu.assistant.send"), exact: true }).click();
}

for (const site of ALL_SITES) {
  const m = site.menu;
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the assistant card opens a chat, and what the customer asks for lands in the cart priced by the app`, async ({ page }) => {
      await open(page, site, locale);
      await expectLocale(page, locale);
      await expect(cartBar(page, locale)).toHaveCount(0); // nothing in the cart yet

      await openChat(page, locale);
      await expect(chat(page, locale).getByText(t(locale, "Menu.assistant.intro"))).toBeVisible();

      const name = m.simple[locale];
      await say(page, locale, `2 ${name}`);
      // The reply is the assistant's text as it is (plain text), and the app adds its own note about the cart.
      const reply = locale === "en" ? `Added 2 x ${name}` : `تمام، أضفت 2 x ${name}`;
      await expect(chat(page, locale).getByText(reply, { exact: true })).toBeVisible();

      // The cart holds 2 of it, with the price the APP worked out (takeout estimate: no service charge), not the AI's.
      await chat(page, locale).getByRole("button", { name: t(locale, "Menu.assistant.viewCart"), exact: true }).click();
      await expect(dialog(page).getByRole("heading", { name: t(locale, "Menu.cart.title") })).toBeVisible();
      await expect(dialog(page)).toContainText(name);
      await expect(dialog(page)).toContainText(jd(m.simple.pickupTwo.total, locale));
    });

    test(`${site.key} /${locale}: the plain menu has no assistant: no card, no chat`, async ({ page }) => {
      await open(page, site, locale);
      await expect(page.getByRole("button", { name: /assistant|المساعد/i })).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test(`${site.key} /${locale}: the chat offers suggested questions, and tapping one sends it`, async ({ page }) => {
      await open(page, site, locale);
      const firstCategory = (await page.locator("h2[id^='cat-']").first().innerText()).trim();
      await openChat(page, locale);
      const suggestions = chat(page, locale).getByRole("group", { name: t(locale, "Menu.assistant.suggestions.label"), exact: true });
      await expect(suggestions.getByRole("button", { name: t(locale, "Menu.assistant.suggestions.recommend"), exact: true })).toBeVisible();
      await expect(suggestions.getByRole("button", { name: t(locale, "Menu.assistant.suggestions.cheapest"), exact: true })).toBeVisible();
      await expect(suggestions.getByRole("button", { name: t(locale, "Menu.assistant.suggestions.forTwo"), exact: true })).toBeVisible();
      // One suggestion per menu category (the first few): "What do you have in <category>?"
      await expect(suggestions.getByRole("button", { name: t(locale, "Menu.assistant.suggestions.category", { name: firstCategory }), exact: true })).toBeVisible();

      // Tapping one sends it as the customer's message, and the assistant answers it (the stand-in finds nothing to add).
      const question = t(locale, "Menu.assistant.suggestions.recommend");
      await suggestions.getByRole("button", { name: question, exact: true }).click();
      await expect(chat(page, locale).getByText(question, { exact: true }).first()).toBeVisible();
      await expect(chat(page, locale).getByText(locale === "en" ? "I could not find that on the menu." : "لم أجد ذلك في القائمة.", { exact: true })).toBeVisible();
    });

    test(`${site.key} /${locale}: an item with choices is added with its required choice made, and the customer still reviews the cart`, async ({ page }) => {
      await open(page, site, locale);
      await openChat(page, locale);
      await say(page, locale, m.withOptions[locale]);
      await expect(chat(page, locale).getByText(locale === "en" ? `Added 1 x ${m.withOptions.en}` : `تمام، أضفت 1 x ${m.withOptions.ar}`, { exact: true })).toBeVisible();

      await chat(page, locale).getByRole("button", { name: t(locale, "Menu.assistant.viewCart"), exact: true }).click();
      await expect(dialog(page)).toContainText(m.withOptions[locale]);
      // Nothing was ordered: the order is placed from the cart, by the customer.
      await expect(dialog(page).getByRole("heading", { name: t(locale, "Menu.order.title") })).toHaveCount(0);
      await expect(dialog(page).getByRole("button", { name: t(locale, "Menu.cart.placeOrder") })).toBeVisible();
    });

    test(`${site.key} /${locale}: an item that is not on the menu is refused with a note, and the cart stays empty`, async ({ page }) => {
      await open(page, site, locale);
      await openChat(page, locale);
      await say(page, locale, "inventedthing please");
      await expect(chat(page, locale).getByText(t(locale, "Menu.assistant.rejected.UNKNOWN_ITEM"), { exact: true })).toBeVisible();
      await expect(chat(page, locale).getByRole("button", { name: t(locale, "Menu.assistant.viewCart"), exact: true })).toHaveCount(0); // empty cart: no button
      await chat(page, locale).getByRole("button", { name: t(locale, "Menu.assistant.close"), exact: true }).click();
      await expect(cartBar(page, locale)).toHaveCount(0);
    });

    test(`${site.key} /${locale}: when the AI service fails the chat says so kindly, and the menu still works`, async ({ page }) => {
      await open(page, site, locale);
      await openChat(page, locale);
      await say(page, locale, "break");
      await expect(chat(page, locale).getByText(t(locale, "Menu.assistant.errors.failed"), { exact: true })).toBeVisible();
      await chat(page, locale).getByRole("button", { name: t(locale, "Menu.assistant.close"), exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Menu.title"));
    });
  }
}
