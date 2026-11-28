import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, expectLocale, LOCALES, SITES, signIn, t, type Locale, type Site } from "./support/demo";
import { submitPasswordChange } from "./support/password";

// The staff ("team") screen of the owner and manager: who works here, adding a member with a temporary password,
// changing a role, a new temporary password, removing, hiring again. Every test works on a member it adds itself
// ("e2e-team-...@test.local") and NEVER presses a button on a seeded demo member. The member is removed at the end,
// and e2e/support/global-cleanup.ts deletes the account (and with it any membership a failed test left behind).
// Demo Coffee has no tables, so since 2026-11-27 its Staff screen offers only Cashier (PROJECT_SPEC.md §3.3): there the
// member is a cashier throughout, and a cashier there starts on the kitchen screen after signing in.

const PASSWORD_SHAPE = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/;

const members = (page: Page) => page.locator("section[aria-labelledby=members]");
const row = (page: Page, email: string) => members(page).getByRole("listitem", { name: email, exact: true });
const roleSelect = (page: Page, locale: Locale, email: string) => row(page, email).getByLabel(t(locale, "Team.roleOf", { email }), { exact: true });

async function signInWith(page: Page, site: Site, locale: Locale, email: string, password: string) {
  await page.goto(`${site.origin}/${locale}/staff/login`);
  await page.getByLabel(t(locale, "StaffLogin.email")).fill(email);
  await page.getByLabel(t(locale, "StaffLogin.password")).fill(password);
  await page.getByRole("button", { name: t(locale, "StaffLogin.submit") }).click();
}

async function addMember(page: Page, locale: Locale, email: string, role: "MANAGER" | "WAITER" | "CASHIER") {
  await page.getByLabel(t(locale, "Team.email"), { exact: true }).fill(email);
  await page.getByLabel(t(locale, "Team.role"), { exact: true }).selectOption(role);
  await page.getByRole("button", { name: t(locale, "Team.add"), exact: true }).click();
}

/** Clicks a button that asks "are you sure?" and answers the question. */
async function confirmClick(page: Page, button: ReturnType<Page["getByRole"]>, answer: "accept" | "dismiss") {
  page.once("dialog", (dialog) => (answer === "accept" ? dialog.accept() : dialog.dismiss()));
  await button.click();
}

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the owner adds a member, changes their role, gives a new password, removes and re-hires them`, async ({ page, browser }) => {
      const run = Math.random().toString(36).slice(2, 8);
      const email = `e2e-team-${run}-${site.key}-${locale}@test.local`;
      const own = `my own password ${run}`;
      // The roles this restaurant offers: Grill (tables) all three; Coffee (no tables) only Cashier.
      const roles = site.tables.dineIn
        ? ({ first: "WAITER", changed: "CASHIER", rehired: "MANAGER" } as const)
        : ({ first: "CASHIER", changed: null, rehired: "CASHIER" } as const);

      await signIn(page, site, site.owner, locale);
      await page.getByRole("link", { name: new RegExp(`^${t(locale, "StaffHome.teamLink")}`) }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff/team$`));
      await expectLocale(page, locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Team.title"));

      // Who works here: the owner (marked "you", with nothing to press) and the seeded staff.
      await expect(row(page, site.owner)).toContainText(t(locale, "Team.you"));
      await expect(row(page, site.owner)).toContainText(t(locale, "Roles.OWNER"));
      await expect(row(page, site.owner).getByRole("button")).toHaveCount(0);
      for (const seeded of [site.waiter, site.cashier]) if (seeded) await expect(row(page, seeded)).toBeVisible();
      const before = await members(page).getByRole("listitem").count();

      // Refusals: somebody who already works here, and an email in use at the other demo restaurant.
      await addMember(page, locale, site.owner, roles.first);
      await expect(page.getByText(t(locale, "Team.errors.alreadyMember"))).toBeVisible();
      const elsewhere = site.key === "grill" ? SITES.coffee.owner : SITES.grill.owner;
      await addMember(page, locale, elsewhere, roles.first);
      await expect(page.getByText(t(locale, "Team.errors.taken"))).toBeVisible();
      await expect(members(page).getByRole("listitem")).toHaveCount(before);

      // A new member: the temporary password is shown once, the list has them, the form is empty again.
      await addMember(page, locale, email, roles.first);
      const added = page.getByRole("status").filter({ hasText: email });
      await expect(added).toContainText(t(locale, "Team.addedTitle", { email, role: t(locale, `Roles.${roles.first}`) }));
      const first = (await added.locator("code").innerText()).trim();
      expect(first).toMatch(PASSWORD_SHAPE);
      await expect(row(page, email)).toBeVisible();
      await expect(roleSelect(page, locale, email)).toHaveValue(roles.first);
      await expect(page.getByLabel(t(locale, "Team.email"), { exact: true })).toHaveValue("");
      await expect(members(page).getByRole("listitem")).toHaveCount(before + 1);

      // The new member signs in: the temporary password opens only "choose your own password"; then they are a waiter
      // here (in their role), with no staff screen of their own.
      const member = await browser.newContext();
      const memberPage = await member.newPage();
      await signInWith(memberPage, site, locale, email, first);
      await expect(memberPage).toHaveURL(new RegExp(`/${locale}/staff/password$`));
      await submitPasswordChange(memberPage, locale, first, own);
      await expect(memberPage.getByText(t(locale, "Password.saved"))).toBeVisible();
      await memberPage.goto(`${site.origin}/${locale}/staff`);
      await expect(memberPage.getByText(t(locale, `Roles.${roles.first}`), { exact: true })).toBeVisible();
      await expect(memberPage.getByRole("link", { name: new RegExp(`^${t(locale, "StaffHome.teamLink")}`) })).toHaveCount(0);
      await memberPage.goto(`${site.origin}/${locale}/staff/team`);
      await expect(memberPage.getByRole("heading", { level: 1 })).toHaveText(t(locale, "NotFound.title"));

      if (roles.changed) {
        // Waiter -> cashier: stored (a reload shows it), and the member's own dashboard says so.
        await roleSelect(page, locale, email).selectOption(roles.changed);
        await row(page, email).getByRole("button", { name: t(locale, "Team.saveRole"), exact: true }).click();
        await expect(row(page, email)).toContainText(new RegExp(`${t(locale, `Roles.${roles.changed}`)} · `));
        await page.reload();
        await expect(roleSelect(page, locale, email)).toHaveValue(roles.changed);
        await memberPage.goto(`${site.origin}/${locale}/staff`);
        await expect(memberPage.getByText(t(locale, `Roles.${roles.changed}`), { exact: true })).toBeVisible();
      } else {
        // No tables: Cashier is the only role on offer, when adding and when changing a member.
        await expect(page.getByLabel(t(locale, "Team.role"), { exact: true }).locator("option")).toHaveText([t(locale, "Roles.CASHIER")]);
        await expect(roleSelect(page, locale, email).locator("option")).toHaveText([t(locale, "Roles.CASHIER")]);
      }
      await member.close();

      // A new temporary password ("are you sure?" -> no does nothing): their own password dies, the new one is temporary.
      const newPassword = row(page, email).getByRole("button", { name: t(locale, "Team.newPassword"), exact: true });
      await confirmClick(page, newPassword, "dismiss");
      await expect(row(page, email).getByRole("status")).toHaveCount(0);
      await confirmClick(page, newPassword, "accept");
      await expect(row(page, email).getByRole("status")).toContainText(t(locale, "Team.newPasswordIssued", { email }));
      const second = (await row(page, email).getByRole("status").locator("code").innerText()).trim();
      expect(second).toMatch(PASSWORD_SHAPE);
      expect(second).not.toBe(first);
      const later = await browser.newContext();
      const laterPage = await later.newPage();
      await signInWith(laterPage, site, locale, email, own);
      await expect(laterPage.getByText(t(locale, "StaffLogin.invalid"))).toBeVisible();
      await signInWith(laterPage, site, locale, email, second);
      await expect(laterPage).toHaveURL(new RegExp(`/${locale}/staff/password$`));

      // Removed ("are you sure?" -> no keeps them): gone from the list, and no longer able to sign in here.
      const remove = row(page, email).getByRole("button", { name: t(locale, "Team.remove"), exact: true });
      await confirmClick(page, remove, "dismiss");
      await expect(row(page, email)).toBeVisible();
      await confirmClick(page, remove, "accept");
      await expect(row(page, email)).toHaveCount(0);
      await expect(members(page).getByRole("listitem")).toHaveCount(before);
      await signInWith(laterPage, site, locale, email, second);
      await expect(laterPage.getByText(t(locale, "StaffLogin.invalid"))).toBeVisible();

      // Hired again (as a manager where there are tables): a new temporary password.
      await addMember(page, locale, email, roles.rehired);
      const rehired = page.getByRole("status").filter({ hasText: email });
      await expect(rehired).toContainText(t(locale, `Roles.${roles.rehired}`));
      // Wait for the NEW notice: where the member is hired in the same role again (Coffee: Cashier both times) the
      // first notice still on the page says the same, with the first password.
      await expect(rehired.locator("code")).not.toHaveText(first);
      const third = (await rehired.locator("code").innerText()).trim();
      expect(third).not.toBe(second);
      await signInWith(laterPage, site, locale, email, third);
      await expect(laterPage).toHaveURL(new RegExp(`/${locale}/staff/password$`));
      await submitPasswordChange(laterPage, locale, third, `${own} again`);
      await expect(laterPage.getByText(t(locale, "Password.saved"))).toBeVisible();
      await laterPage.goto(`${site.origin}/${locale}/staff/team`);
      if (roles.rehired === "MANAGER") {
        // A manager HAS the staff screen, and cannot touch themselves or the owner.
        await expect(laterPage.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Team.title"));
        await expect(row(laterPage, email)).toContainText(t(locale, "Team.you"));
        await expect(row(laterPage, email).getByRole("button")).toHaveCount(0); // not oneself
        await expect(row(laterPage, site.owner).getByRole("button")).toHaveCount(0); // not the owner
        await expect(row(laterPage, site.owner)).toContainText(t(locale, "Team.ownerNote"));
      } else {
        // The counter cashier of a shop without tables: no staff screen, and the next sign-in opens the kitchen screen.
        await expect(laterPage.getByRole("heading", { level: 1 })).toHaveText(t(locale, "NotFound.title"));
        const counter = await browser.newContext();
        const counterPage = await counter.newPage();
        await signInWith(counterPage, site, locale, email, `${own} again`);
        await expect(counterPage).toHaveURL(new RegExp(`/${locale}/staff/kitchen$`));
        await expect(counterPage.getByRole("heading", { level: 1 })).toHaveText(t(locale, "StaffKitchen.title"));
        await counter.close();
      }
      await later.close();

      // Tidy up: remove the member again. The demo staff are as they were.
      await page.reload();
      await confirmClick(page, row(page, email).getByRole("button", { name: t(locale, "Team.remove"), exact: true }), "accept");
      await expect(row(page, email)).toHaveCount(0);
      await expect(members(page).getByRole("listitem")).toHaveCount(before);
    });
  }
}

test("waiters and cashiers have no staff screen, and it needs a login", async ({ page }) => {
  const site = SITES.grill;
  await page.goto(`${site.origin}/en/staff/team`);
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
  for (const email of [site.waiter, site.cashier]) {
    await signIn(page, site, email, "en");
    await expect(page.getByRole("link", { name: new RegExp(`^${t("en", "StaffHome.teamLink")}`) })).toHaveCount(0);
    await page.goto(`${site.origin}/en/staff/team`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("en", "NotFound.title"));
    await page.goto(`${site.origin}/en/staff`);
    await page.getByRole("button", { name: t("en", "StaffHome.signOut") }).click();
    await expect(page).toHaveURL(/\/en\/staff\/login$/);
  }
  // The demo staff still sign in with the demo password: nothing in these tests touched them.
  await signIn(page, site, site.waiter, "en");
});
