import { expect, test, type Page } from "@playwright/test";
import { ALL_SITES, LOCALES, signIn, t, type Locale, type Site } from "./support/demo";

// A real 1x1 PNG, enough for the upload checks (the type is decided from the file's bytes).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const FIELDS = ["nameEn", "nameAr", "taglineEn", "taglineAr", "aboutEn", "aboutAr", "addressEn", "addressAr", "phone", "hoursEn", "hoursAr"];

const open = async (page: Page, site: Site, locale: Locale) => {
  await signIn(page, site, site.owner, locale);
  await page.goto(`${site.origin}/${locale}/staff/branding`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Branding.title"));
};
const form = (page: Page) => page.locator("#phone").locator("xpath=ancestor::form");
const save = (page: Page, locale: Locale) => form(page).getByRole("button", { name: t(locale, "Common.save"), exact: true });
const pickColor = (page: Page, id: string) => form(page).locator(`[name=accent][value=${id}]`).check({ force: true });

/** Remembers every branding field so a test can put them back exactly. */
async function snapshot(page: Page) {
  const values: Record<string, string> = {};
  for (const id of FIELDS) values[id] = await form(page).locator(`#${id}`).inputValue();
  const accent = (await form(page).locator("[name=accent]:checked").getAttribute("value")) ?? "charcoal";
  return { values, accent };
}
async function restore(page: Page, site: Site, locale: Locale, saved: Awaited<ReturnType<typeof snapshot>>) {
  await page.goto(`${site.origin}/${locale}/staff/branding`);
  for (const id of FIELDS) await form(page).locator(`#${id}`).fill(saved.values[id]!);
  await pickColor(page, saved.accent);
  await save(page, locale).click();
  await expect(page.getByText(t(locale, "Branding.saved"))).toBeVisible();
}

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: branding shows the restaurant and refuses an invalid phone number`, async ({ page }) => {
      await open(page, site, locale);
      await expect(form(page).locator("#nameEn")).toHaveValue(site.name.en);
      await expect(form(page).locator("[name=accent]")).toHaveCount(8);

      await form(page).locator("#phone").fill("call us");
      await save(page, locale).click();
      await expect(page.getByText(t(locale, "Branding.errors.invalid"))).toBeVisible();
      await expect(form(page).locator("#phone")).toHaveValue("call us"); // kept for correction
    });

    test(`${site.key} /${locale}: saved branding appears on the public page (and is put back)`, async ({ page }) => {
      await open(page, site, locale);
      const original = await snapshot(page);
      try {
        await form(page).locator("#taglineEn").fill("E2E tagline");
        await form(page).locator("#taglineAr").fill("شعار الاختبار");
        await form(page).locator("#phone").fill("+٩٦٢ ٦ ٥٥٥ ٠١٠٠"); // Arabic digits are normalised
        await pickColor(page, "orange");
        await save(page, locale).click();
        await expect(page.getByText(t(locale, "Branding.saved"))).toBeVisible();

        await page.goto(`${site.origin}/${locale}`);
        await expect(page.getByText(locale === "en" ? "E2E tagline" : "شعار الاختبار")).toBeVisible();
        await expect(page.getByRole("link", { name: "+962 6 555 0100" })).toHaveAttribute("href", "tel:+96265550100");
        await expect(page.locator("header")).toHaveCSS("background-color", "rgb(194, 65, 12)"); // the palette's orange
      } finally {
        await restore(page, site, locale, original);
      }
      await page.goto(`${site.origin}/${locale}`);
      await expect(page.getByText("E2E tagline")).toHaveCount(0);
    });
  }

  test(`${site.key}: the owner uploads a logo, it shows on the public page, and removing it takes it away`, async ({ page }) => {
    const locale: Locale = "en";
    await open(page, site, locale);
    const pageLogo = page.locator("header img");

    await page.locator("input[type=file][name=photo]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: t(locale, "Logo.upload") }).click();
    await expect(page.getByRole("button", { name: t(locale, "Logo.remove") })).toBeVisible();
    try {
      await page.goto(`${site.origin}/${locale}`);
      await expect(pageLogo).toBeVisible();
      expect(await pageLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    } finally {
      await page.goto(`${site.origin}/${locale}/staff/branding`);
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: t(locale, "Logo.remove") }).click();
      await expect(page.getByRole("button", { name: t(locale, "Logo.remove") })).toHaveCount(0);
    }
    await page.goto(`${site.origin}/${locale}`);
    await expect(pageLogo).toHaveCount(0);
  });

  test(`${site.key}: a file that is not an image is refused as a logo`, async ({ page }) => {
    const locale: Locale = "en";
    await open(page, site, locale);
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    await page.locator("input[type=file][name=photo]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: svg });
    await page.getByRole("button", { name: t(locale, "Logo.upload") }).click();
    await expect(page.getByText(t(locale, "Logo.errors.notImage"))).toBeVisible();
    await expect(page.getByRole("button", { name: t(locale, "Logo.remove") })).toHaveCount(0);
  });
}
