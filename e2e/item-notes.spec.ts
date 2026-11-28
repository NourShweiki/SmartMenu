import { expect, test } from "@playwright/test";
import { addButton, cartBar, confirmation, dialog, menuRow, placeButton } from "./support/cart";
import { jd, LOCALES, signIn, SITES, t } from "./support/demo";
import { cancelOrderOn, orderCard } from "./support/staff";
import { guest } from "./support/tables";

// Item notes (PROJECT_SPEC.md §3.3) at Demo Coffee, where the seed lets the Cappuccino take a note: the customer writes
// one on the cart line (the Arabic coffee, which takes none, has no note box), orders, and the note reaches the kitchen
// screen and the Orders list as typed. The price does not change. The customer is "E2E ...", and the order is
// cancelled at the end.

const site = SITES.coffee;
const m = site.menu;

for (const locale of LOCALES) {
  test(`coffee /${locale}: a customer's note on an item that takes one reaches the kitchen ticket and the Orders list, at no extra cost`, async ({ page, browser }) => {
    const customer = `E2E ${Math.floor(1000 + Math.random() * 9000)}`;
    const note = locale === "en" ? "less sugar, extra hot" : "سكر خفيف وساخن جداً";
    const phone = await guest(browser);
    const p = phone.page;
    await p.goto(`${site.origin}/${locale}/menu`);

    // A cappuccino (no choices made) and an Arabic coffee.
    await addButton(menuRow(p, m.withOptions[locale]), locale).click();
    await dialog(p).getByRole("button", { name: new RegExp(t(locale, "Menu.addToCart")) }).click();
    await expect(dialog(p)).toHaveCount(0);
    await addButton(menuRow(p, m.simple[locale]), locale).click();
    await cartBar(p, locale).click();

    // Only the cappuccino has a note box; the note is saved when the box is left, and the total stays the same.
    const noteBoxes = dialog(p).getByLabel(t(locale, "Menu.cart.noteLabel"), { exact: true });
    await expect(noteBoxes).toHaveCount(1);
    const total = dialog(p).locator("dl > div").filter({ hasText: new RegExp(`^${t(locale, "Menu.cart.total")}`) });
    // Cappuccino 2.250 + Arabic coffee 1.000 = 3.250, 16% tax 0.520: 3.770 (takeout: no service charge).
    await expect(total).toContainText(jd(3770, locale));
    await noteBoxes.fill(note);
    await noteBoxes.press("Enter");
    await expect(noteBoxes).toHaveValue(note);
    await expect(total).toContainText(jd(3770, locale)); // the note changed nothing

    await dialog(p).getByLabel(t(locale, "Menu.pickup.name"), { exact: true }).fill(customer);
    await dialog(p).getByLabel(t(locale, "Menu.pickup.phone"), { exact: true }).fill("0791234567");
    await placeButton(p, locale).click();
    const number = await confirmation(p, locale);
    await phone.context.close();

    // The kitchen screen shows the note on the cappuccino's line, highlighted, as typed.
    await signIn(page, site, site.owner, locale);
    await page.goto(`${site.origin}/${locale}/staff/kitchen`);
    const ticket = page.getByRole("listitem", { name: t(locale, "StaffKitchen.order", { number }), exact: true });
    const cappuccinoLine = ticket.getByRole("listitem").filter({ hasText: m.withOptions[locale] });
    await expect(cappuccinoLine).toContainText(`${t(locale, "StaffKitchen.note")} ${note}`);
    await expect(ticket.getByRole("listitem").filter({ hasText: m.simple[locale] })).not.toContainText(t(locale, "StaffKitchen.note"));
    // The note costs nothing: cappuccino 2.250 + Arabic coffee 1.000 = 3.250, 16% tax 0.520, total 3.770 (takeout: no service).
    await expect(ticket).toContainText(jd(3770, locale));

    // The Orders list shows it too; then the order is cancelled (nothing stays behind).
    await page.goto(`${site.origin}/${locale}/staff/orders`);
    await expect(orderCard(page, locale, number)).toContainText(note);
    await cancelOrderOn(page, locale, number, "OTHER");
  });
}
