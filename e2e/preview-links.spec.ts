import { expect, test } from "@playwright/test";
import { ALL_SITES, LOCALES, PASSWORD, SITES, t, type Locale, type Site } from "./support/demo";
import { PLATFORM_ORIGIN, PREVIEW_ORIGIN } from "./support/server";

/**
 * Preview links (PROJECT_SPEC.md §5): on a deployment WITHOUT restaurant subdomains (e.g. xxx.vercel.app), the bare
 * address shows one restaurant through `/r/<slug>/<path>`. Runs against the second test server, which has
 * RESTAURANT_PREVIEW_LINKS=1 (playwright.config.ts). Nothing here changes data.
 */
const P = PREVIEW_ORIGIN;
const name = (site: Site, locale: Locale) => site.name[locale];

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: customer home, menu and staff sign-in all work through preview links, with a banner and a way out`, async ({ page }) => {
      // Customer home + banner.
      await page.goto(`${P}/r/${site.slug}/${locale}`);
      await expect(page).toHaveURL(`${P}/${locale}`);
      const banner = page.getByRole("status").filter({ hasText: t(locale, "Preview.exit") });
      await expect(banner).toContainText(name(site, locale));
      await expect(page.getByText(name(site, locale)).first()).toBeVisible();

      // Menu (dine-in and takeout ordering start here).
      await page.goto(`${P}/r/${site.slug}/${locale}/menu`);
      await expect(page).toHaveURL(`${P}/${locale}/menu`);
      await expect(page.getByText(site.menu.simple[locale]).first()).toBeVisible();

      // Staff sign-in, then the staff home of THIS restaurant.
      await page.goto(`${P}/r/${site.slug}/${locale}/staff/login`);
      await page.getByLabel(t(locale, "StaffLogin.email")).fill(site.owner);
      await page.getByLabel(t(locale, "StaffLogin.password")).fill(PASSWORD);
      await page.getByRole("button", { name: t(locale, "StaffLogin.submit") }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/staff$`));
      await expect(page.getByText(name(site, locale)).first()).toBeVisible();

      // Exit: back to the platform, no banner, the restaurant is gone.
      await page.getByRole("link", { name: t(locale, "Preview.exit") }).click();
      await expect(page).toHaveURL(new RegExp(`^${P}/(en|ar)$`));
      await expect(page.getByText(t(locale, "Preview.exit"))).toHaveCount(0);
    });
  }
}

test("switching restaurants: the last preview link wins, and the other restaurant's staff session does not carry over", async ({ page }) => {
  await page.goto(`${P}/r/${SITES.grill.slug}/en/staff/login`);
  await page.getByLabel(t("en", "StaffLogin.email")).fill(SITES.grill.owner);
  await page.getByLabel(t("en", "StaffLogin.password")).fill(PASSWORD);
  await page.getByRole("button", { name: t("en", "StaffLogin.submit") }).click();
  await expect(page).toHaveURL(/\/en\/staff$/);

  // Same browser, same address, now previewing Demo Coffee: Grill's owner is not staff there.
  await page.goto(`${P}/r/${SITES.coffee.slug}/en/staff`);
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
  await expect(page.getByText(SITES.coffee.name.en).first()).toBeVisible();
});

test("a table's QR code made in preview mode carries the preview link, so another phone reaches the right restaurant", async ({ page }) => {
  await page.goto(`${P}/r/${SITES.grill.slug}/en/staff/login`);
  await page.getByLabel(t("en", "StaffLogin.email")).fill(SITES.grill.owner);
  await page.getByLabel(t("en", "StaffLogin.password")).fill(PASSWORD);
  await page.getByRole("button", { name: t("en", "StaffLogin.submit") }).click();
  await expect(page).toHaveURL(/\/en\/staff$/);
  await page.goto(`${P}/en/staff/tables`);
  await expect(page.locator("body")).toContainText(`${P}/r/${SITES.grill.slug}/t/${SITES.grill.tables.token}`);
});

test("the setup tool stays on the platform's address while a restaurant is previewed", async ({ page }) => {
  await page.goto(`${P}/r/${SITES.grill.slug}/en`);
  const response = await page.goto(`${P}/en/setup/login`);
  expect(response?.status()).toBe(200);
  await expect(page.getByLabel(t("en", "StaffLogin.email")).or(page.getByRole("textbox").first())).toBeVisible();
  // No "Preview: Demo Grill" banner on the setup tool: it never belongs to a restaurant.
  await expect(page.getByText(t("en", "Preview.exit"))).toHaveCount(0);
});

test("refused: unknown restaurant, paths outside the restaurant's pages, and previews where they are switched off", async ({ request }) => {
  const status = async (url: string) => (await request.get(url, { maxRedirects: 0 })).status();
  expect(await status(`${P}/r/nobody-here`)).toBe(404);
  expect(await status(`${P}/r/admin`)).toBe(404);
  expect(await status(`${P}/r/${SITES.grill.slug}/setup`)).toBe(404);
  expect(await status(`${P}/r/${SITES.grill.slug}/fr/menu`)).toBe(404);
  expect(await status(`${P}/r/${SITES.grill.slug}/en/a.b`)).toBe(404);
  expect(await status(`${P}/r/${SITES.grill.slug}/en`)).toBe(307);
  // The normal test server has previews OFF (like local development and any deployment with real subdomains).
  expect(await status(`${PLATFORM_ORIGIN}/r/${SITES.grill.slug}`)).toBe(404);
  expect(await status(`${PLATFORM_ORIGIN}/r`)).toBe(404);
});
