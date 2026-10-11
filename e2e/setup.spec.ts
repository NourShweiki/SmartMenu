import { expect, test, type Page } from "@playwright/test";
import { LOCALES, PASSWORD, SITES, expectLocale, t, type Locale } from "./support/demo";
import { passwordError, submitPasswordChange } from "./support/password";
import { originOf, PLATFORM_ORIGIN } from "./support/server";

// The founders' setup tool, on the platform's own address: sign-in for founders only, the list of restaurants, and
// creating a restaurant with its first owner. What the tests create is named "e2e-..." and is removed by
// e2e/support/global-cleanup.ts before and after the suite (there is no screen that deletes a restaurant).

const FOUNDER = "founder@demo-platform.test"; // supabase/seed.sql

async function signInAt(page: Page, loginUrl: string, locale: Locale, email: string, password: string) {
  await page.goto(loginUrl);
  await page.getByLabel(t(locale, "StaffLogin.email")).fill(email);
  await page.getByLabel(t(locale, "StaffLogin.password")).fill(password);
  await page.getByRole("button", { name: t(locale, "StaffLogin.submit") }).click();
}

const field = (page: Page, locale: Locale, name: "nameEn" | "nameAr" | "slug" | "ownerEmail") => page.getByLabel(t(locale, `Setup.${name}`), { exact: true });
const create = (page: Page, locale: Locale) => page.getByRole("button", { name: t(locale, "Setup.submit"), exact: true });
const list = (page: Page) => page.locator("section[aria-labelledby=restaurants]");
const created = (page: Page, locale: Locale) => page.getByRole("status").filter({ hasText: t(locale, "Setup.createdPassword") });
const PASSWORD_SHAPE = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/;

for (const locale of LOCALES) {
  test(`setup /${locale}: only founders get in, and only on the platform's own address`, async ({ page }) => {
    await page.goto(`${PLATFORM_ORIGIN}/${locale}/setup`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/setup/login$`));
    await expectLocale(page, locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Setup.loginTitle"));

    // A wrong password, and a restaurant's owner with the right one, get the same answer and no session.
    for (const [email, password] of [[FOUNDER, "not-the-password"], [SITES.grill.owner, PASSWORD]] as const) {
      await signInAt(page, `${PLATFORM_ORIGIN}/${locale}/setup/login`, locale, email, password);
      await expect(page.getByText(t(locale, "StaffLogin.invalid"))).toBeVisible();
      await page.goto(`${PLATFORM_ORIGIN}/${locale}/setup`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/setup/login$`));
    }

    // On a restaurant's address the setup tool does not exist.
    for (const path of ["setup", "setup/login"]) {
      await page.goto(`${SITES.grill.origin}/${locale}/${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "NotFound.title"));
    }

    // The founder gets in, sees both demo restaurants, and signs out again.
    await signInAt(page, `${PLATFORM_ORIGIN}/${locale}/setup/login`, locale, FOUNDER, PASSWORD);
    await expect(page).toHaveURL(new RegExp(`/${locale}/setup$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Setup.title"));
    for (const site of [SITES.grill, SITES.coffee]) {
      await expect(list(page).getByText(site.name[locale], { exact: true })).toBeVisible();
      await expect(list(page).getByText(`${site.slug}.localhost`, { exact: false })).toBeVisible();
    }
    // A founder is not staff of any restaurant.
    await page.goto(`${SITES.grill.origin}/${locale}/staff`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/staff/login$`));
    await page.goto(`${PLATFORM_ORIGIN}/${locale}/setup`);
    await page.getByRole("button", { name: t(locale, "Setup.signOut"), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/setup/login$`));
  });

  test(`setup /${locale}: a founder creates a restaurant; its owner signs in with the temporary password and must choose their own`, async ({ page, browser }) => {
    const run = Math.random().toString(36).slice(2, 8);
    const type = locale === "en" ? "takeout" : "dine-in"; // one business type per language: both presets get used
    const slug = `e2e-${run}-${locale}`;
    const email = `e2e-${run}-${locale}@test.local`;
    const name = { en: `E2E Place ${run}`, ar: `مطعم الاختبار ${run}` };

    await signInAt(page, `${PLATFORM_ORIGIN}/${locale}/setup/login`, locale, FOUNDER, PASSWORD);
    await expect(page).toHaveURL(new RegExp(`/${locale}/setup$`));
    const firstFormId = await page.locator("input[name=id]").inputValue();

    const fill = async (address: string, ownerEmail: string) => {
      await field(page, locale, "nameEn").fill(name.en);
      await field(page, locale, "nameAr").fill(name.ar);
      await field(page, locale, "slug").fill(address);
      await page.getByRole("radio", { name: new RegExp(`^${t(locale, type === "takeout" ? "Setup.takeout" : "Setup.dineIn")}`) }).check();
      await field(page, locale, "ownerEmail").fill(ownerEmail);
      await create(page, locale).click();
    };

    // Refusals say what is wrong next to the field, keep what was typed, and create nothing.
    await fill("admin", email);
    await expect(page.getByText(t(locale, "Setup.errors.slugReserved"))).toBeVisible();
    await expect(field(page, locale, "nameEn")).toHaveValue(name.en);
    await expect(field(page, locale, "nameAr")).toHaveValue(name.ar);
    await fill(SITES.grill.slug, email);
    await expect(page.getByText(t(locale, "Setup.errors.slugTaken"))).toBeVisible();
    await fill(slug, SITES.grill.owner);
    await expect(page.getByText(t(locale, "Setup.errors.emailTaken"))).toBeVisible();
    await expect(list(page).getByText(name[locale], { exact: true })).toHaveCount(0);
    await expect(created(page, locale)).toHaveCount(0);

    // The real thing: the notice shows where the owner signs in, with which email, and the temporary password.
    await fill(slug, email);
    const notice = created(page, locale);
    await expect(notice).toContainText(t(locale, "Setup.createdTitle", { name: name[locale] }));
    await expect(notice.getByRole("link")).toHaveAttribute("href", `${originOf(slug)}/ar/staff/login`); // default language of a new restaurant
    await expect(notice).toContainText(email);
    const password = (await notice.locator("code").innerText()).trim();
    expect(password).toMatch(PASSWORD_SHAPE);
    // The form is empty again and the restaurant is in the list, with its address.
    await expect(field(page, locale, "nameEn")).toHaveValue("");
    await expect(field(page, locale, "slug")).toHaveValue("");
    await expect(list(page).getByText(name[locale], { exact: true })).toBeVisible();
    await expect(list(page).getByText(`${slug}.localhost`, { exact: false })).toBeVisible();

    // The same form arriving a second time (same id) creates nothing and says so.
    const usedFormId = firstFormId;
    expect(await page.locator("input[name=id]").inputValue()).not.toBe(usedFormId);
    await page.locator("input[name=id]").evaluate((input, id) => ((input as HTMLInputElement).value = id), usedFormId);
    await field(page, locale, "nameEn").fill(name.en);
    await field(page, locale, "nameAr").fill(name.ar);
    await field(page, locale, "slug").fill(`${slug}-again`);
    await field(page, locale, "ownerEmail").fill(`e2e-${run}-again@test.local`);
    await create(page, locale).click();
    await expect(page.getByRole("alert").filter({ hasText: t(locale, "Setup.errors.alreadyCreated") })).toBeVisible();
    await expect(list(page).getByText(`${slug}-again.localhost`, { exact: false })).toHaveCount(0);

    // The new restaurant's site answers. Its owner signs in with the temporary password, which opens ONE page only:
    // "change my password", whatever page is asked for.
    const own = `my own password ${run}`;
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();
    await ownerPage.goto(`${originOf(slug)}/${locale}`);
    await expect(ownerPage.getByRole("heading", { level: 1 })).toHaveText(name[locale]);
    await signInAt(ownerPage, `${originOf(slug)}/${locale}/staff/login`, locale, email, password);
    await expect(ownerPage).toHaveURL(new RegExp(`/${locale}/staff/password$`));
    await expect(ownerPage.getByText(t(locale, "Password.temporaryNotice"))).toBeVisible();
    for (const screen of ["", "/settings", "/menu", "/orders"]) {
      await ownerPage.goto(`${originOf(slug)}/${locale}/staff${screen}`);
      await expect(ownerPage).toHaveURL(new RegExp(`/${locale}/staff/password$`));
    }
    // Refusals leave the temporary password in place.
    await submitPasswordChange(ownerPage, locale, "not-the-password", own);
    await expect(passwordError(ownerPage, locale, "wrong")).toBeVisible();
    await submitPasswordChange(ownerPage, locale, password, "too short");
    await expect(passwordError(ownerPage, locale, "tooShort")).toBeVisible();
    await submitPasswordChange(ownerPage, locale, password, own, `${own}!`);
    await expect(passwordError(ownerPage, locale, "mismatch")).toBeVisible();
    await ownerPage.goto(`${originOf(slug)}/${locale}/staff`);
    await expect(ownerPage).toHaveURL(new RegExp(`/${locale}/staff/password$`));
    // Their own password: the notice goes, the way to the dashboard opens.
    await submitPasswordChange(ownerPage, locale, password, own);
    await expect(ownerPage.getByText(t(locale, "Password.saved"))).toBeVisible();
    await expect(ownerPage.getByText(t(locale, "Password.temporaryNotice"))).toHaveCount(0);
    await ownerPage.getByRole("link", { name: new RegExp(t(locale, "Password.backToDashboard")) }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/${locale}/staff$`));
    await expect(ownerPage.getByText(name[locale], { exact: true })).toBeVisible();
    await expect(ownerPage.getByText(t(locale, "Roles.OWNER"), { exact: true })).toBeVisible();
    // The business type's preset is what the owner finds in Settings.
    await ownerPage.goto(`${originOf(slug)}/${locale}/staff/settings`);
    const dineIn = ownerPage.getByRole("checkbox", { name: new RegExp(`^${t(locale, "Settings.dineIn")}`) });
    const service = ownerPage.getByLabel(t(locale, "Settings.servicePercent"), { exact: true });
    if (type === "takeout") {
      await expect(dineIn).not.toBeChecked();
      await expect(service).toHaveValue("0");
    } else {
      await expect(dineIn).toBeChecked();
      await expect(service).toHaveValue("10");
    }
    await expect(ownerPage.getByLabel(t(locale, "Settings.taxPercent"), { exact: true })).toHaveValue("16");
    // The owner is nobody at another restaurant.
    await ownerPage.goto(`${SITES.grill.origin}/${locale}/staff`);
    await expect(ownerPage).toHaveURL(new RegExp(`/${locale}/staff/login$`));
    // From now on the temporary password is worthless, and their own goes straight to the dashboard.
    await ownerPage.goto(`${originOf(slug)}/${locale}/staff`);
    await ownerPage.getByRole("button", { name: t(locale, "StaffHome.signOut") }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/${locale}/staff/login$`)); // signed out for real before signing in again
    await signInAt(ownerPage, `${originOf(slug)}/${locale}/staff/login`, locale, email, password);
    await expect(ownerPage.getByText(t(locale, "StaffLogin.invalid"))).toBeVisible();
    await signInAt(ownerPage, `${originOf(slug)}/${locale}/staff/login`, locale, email, own);
    await expect(ownerPage).toHaveURL(new RegExp(`/${locale}/staff$`));

    // "The owner forgot their password": the founder's list shows the restaurant with its owner, and gives them a
    // new temporary password (after an "are you sure?"). Demo Grill's row shows Demo Grill's owner, not this one.
    await page.reload();
    const row = list(page).getByRole("listitem", { name: name[locale], exact: true });
    await expect(row).toContainText(email);
    await expect(list(page).getByRole("listitem", { name: SITES.grill.name[locale], exact: true })).toContainText(SITES.grill.owner);
    await expect(list(page).getByRole("listitem", { name: SITES.grill.name[locale], exact: true })).not.toContainText(email);
    page.once("dialog", (dialog) => dialog.dismiss()); // "are you sure?" -> no: nothing happens
    await row.getByRole("button", { name: t(locale, "Setup.newPassword"), exact: true }).click();
    await expect(row.getByRole("status")).toHaveCount(0);
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: t(locale, "Setup.newPassword"), exact: true }).click();
    await expect(row.getByRole("status")).toContainText(t(locale, "Setup.newPasswordIssued", { email }));
    const reissued = (await row.getByRole("status").locator("code").innerText()).trim();
    expect(reissued).toMatch(PASSWORD_SHAPE);
    expect(reissued).not.toBe(password);

    // The owner's own password is dead; the new one is temporary again: it opens the change-password page only.
    const later = await browser.newContext();
    const laterPage = await later.newPage();
    await signInAt(laterPage, `${originOf(slug)}/${locale}/staff/login`, locale, email, own);
    await expect(laterPage.getByText(t(locale, "StaffLogin.invalid"))).toBeVisible();
    await signInAt(laterPage, `${originOf(slug)}/${locale}/staff/login`, locale, email, reissued);
    await expect(laterPage).toHaveURL(new RegExp(`/${locale}/staff/password$`));
    await expect(laterPage.getByText(t(locale, "Password.temporaryNotice"))).toBeVisible();
    await submitPasswordChange(laterPage, locale, reissued, `${own} again`);
    await expect(laterPage.getByText(t(locale, "Password.saved"))).toBeVisible();
    await later.close();
    await owner.close();
  });
}
