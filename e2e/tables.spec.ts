import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { ALL_SITES, expectLocale, LOCALES, signIn, SITES, t, type Locale, type Site } from "./support/demo";

// Owner: tables and QR codes. Guests: scanning. Everything the tests create is a table labelled "E2E ..." and it is
// deleted again (soft delete) at the end; only tables the tests created are ever scanned, so no live session is left
// on a seeded demo table.

const label = () => `E2E ${Math.floor(100 + Math.random() * 900)}`;
const open = async (page: Page, site: Site, locale: Locale) => {
  await signIn(page, site, site.owner, locale);
  await page.goto(`${site.origin}/${locale}/staff/tables`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Tables.title"));
  page.on("dialog", (dialog) => dialog.accept()); // "are you sure?" questions
};
const row = (page: Page, locale: Locale, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: t(locale, "Tables.tableName", { label: name }), exact: true }) });
const scanUrl = async (r: Locator) => (await r.locator("bdi").innerText()).trim();
const addTable = async (page: Page, locale: Locale, name: string) => {
  await page.locator("#new-table-label").fill(name);
  await page.getByRole("button", { name: t(locale, "Tables.add"), exact: true }).click();
  await expect(row(page, locale, name)).toBeVisible();
};
const removeTable = async (page: Page, site: Site, locale: Locale, name: string) => {
  await page.goto(`${site.origin}/${locale}/staff/tables`);
  const r = row(page, locale, name);
  if (await r.count()) {
    await r.getByRole("button", { name: t(locale, "Tables.delete"), exact: true }).click();
    await expect(row(page, locale, name)).toHaveCount(0);
  }
};
/** A guest's phone: a fresh browser context with nothing saved and nobody signed in. */
async function guest(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}
/** The session id the SERVER stored in this guest's cookie when the QR code was scanned (null = no table). */
const sessionCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === "smartmenu_table_session")?.value ?? null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

for (const site of ALL_SITES) {
  for (const locale of LOCALES) {
    test(`${site.key} /${locale}: the tables screen lists the seeded tables and warns when dine-in is off`, async ({ page }) => {
      await open(page, site, locale);
      for (const name of site.tables.labels) await expect(row(page, locale, name)).toBeVisible();
      await expect(row(page, locale, site.tables.labels[0]!)).toContainText(site.tables.token); // the scan link carries the token
      const warning = page.getByText(t(locale, "Tables.dineInOff"));
      if (site.tables.dineIn) await expect(warning).toHaveCount(0);
      else await expect(warning).toBeVisible();
    });

    test(`${site.key} /${locale}: add, refuse bad or duplicate names, rename, switch off and on, new QR code, delete`, async ({ page }) => {
      await open(page, site, locale);
      const name = label();
      const renamed = `${name} B`;
      try {
        // Refused: empty, then a name that only differs by case/spacing from a seeded one.
        await page.locator("#new-table-label").fill("   ");
        await page.getByRole("button", { name: t(locale, "Tables.add"), exact: true }).click();
        await expect(page.getByText(t(locale, "Tables.errors.required"))).toBeVisible();
        await page.locator("#new-table-label").fill(site.tables.labels.at(-1)!.toLowerCase());
        await page.getByRole("button", { name: t(locale, "Tables.add"), exact: true }).click();
        await expect(page.getByText(t(locale, "Tables.errors.taken"))).toBeVisible();

        await addTable(page, locale, name);
        const url = await scanUrl(row(page, locale, name));
        expect(url).toMatch(new RegExp(`^${site.origin}/t/[A-Za-z0-9_-]{22,}$`));

        // Renaming keeps the QR link (printed codes stay valid).
        const r = row(page, locale, name);
        await r.getByLabel(t(locale, "Tables.labelField")).fill(renamed);
        await r.getByRole("button", { name: t(locale, "Tables.rename"), exact: true }).click();
        await expect(row(page, locale, renamed)).toBeVisible();
        expect(await scanUrl(row(page, locale, renamed))).toBe(url);
        // The row's form is rebuilt after a save: wait for it to show the new name before typing into it again.
        await expect(row(page, locale, renamed).getByLabel(t(locale, "Tables.labelField"))).toHaveValue(renamed);
        // ...and refuses a name another table has.
        await row(page, locale, renamed).getByLabel(t(locale, "Tables.labelField")).fill(site.tables.labels[0]!);
        await row(page, locale, renamed).getByRole("button", { name: t(locale, "Tables.rename"), exact: true }).click();
        await expect(page.getByText(t(locale, "Tables.errors.taken"))).toBeVisible();

        // Switch off / on.
        const rr = () => row(page, locale, renamed);
        await rr().getByRole("button", { name: t(locale, "Tables.deactivate"), exact: true }).click();
        await expect(rr().getByText(t(locale, "Tables.inactive"), { exact: true })).toBeVisible();
        await rr().getByRole("button", { name: t(locale, "Tables.activate"), exact: true }).click();
        await expect(rr().getByText(t(locale, "Tables.active"), { exact: true })).toBeVisible();

        // New QR code: a different link.
        await rr().getByRole("button", { name: t(locale, "Tables.newQr"), exact: true }).click();
        await expect.poll(() => scanUrl(rr())).not.toBe(url);
      } finally {
        await removeTable(page, site, locale, renamed);
        await removeTable(page, site, locale, name);
      }
      await expect(row(page, locale, renamed)).toHaveCount(0);
    });

    test(`${site.key} /${locale}: the print page has one bilingual card with a QR code per active table`, async ({ page }) => {
      await open(page, site, locale);
      await page.goto(`${site.origin}/${locale}/staff/tables/print`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Tables.printTitle"));
      const cards = page.getByRole("main").getByRole("listitem");
      await expect(cards).toHaveCount(site.tables.labels.length);
      for (const name of site.tables.labels) {
        const card = cards.filter({ hasText: t("en", "TableCard.table", { label: name }) });
        await expect(card).toContainText(t("ar", "TableCard.table", { label: name })); // both languages on every card
        await expect(card).toContainText(t("en", "TableCard.scan"));
        await expect(card).toContainText(t("ar", "TableCard.scan"));
        await expect(card).toContainText(site.name.en);
        await expect(card.getByRole("img", { name: t("en", "TableCard.qrLabel", { label: name }) })).toBeVisible();
      }
      // One table only, by its id: the "Print QR code" link of a row.
      await page.goto(`${site.origin}/${locale}/staff/tables`);
      await row(page, locale, site.tables.labels[0]!).getByRole("link", { name: t(locale, "Tables.print") }).click();
      await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(1);
    });
  }
}

test("a switched-off table is left off the print page", async ({ page }) => {
  const site = SITES.grill;
  const name = label();
  await open(page, site, "en");
  try {
    await addTable(page, "en", name);
    await page.goto(`${site.origin}/en/staff/tables/print`);
    await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: t("en", "TableCard.table", { label: name }) })).toHaveCount(1);

    await page.goto(`${site.origin}/en/staff/tables`);
    await row(page, "en", name).getByRole("button", { name: t("en", "Tables.deactivate"), exact: true }).click();
    await expect(row(page, "en", name).getByText(t("en", "Tables.inactive"), { exact: true })).toBeVisible();
    await page.goto(`${site.origin}/en/staff/tables/print`);
    await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: t("en", "TableCard.table", { label: name }) })).toHaveCount(0);
  } finally {
    await removeTable(page, site, "en", name);
  }
});

for (const locale of LOCALES) {
  for (const [role, email] of [["WAITER", SITES.grill.waiter], ["CASHIER", SITES.grill.cashier]] as const) {
    test(`grill /${locale}: a ${role.toLowerCase()} is not offered tables and the pages are 404`, async ({ page }) => {
      await signIn(page, SITES.grill, email, locale);
      await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.tablesLink")) })).toHaveCount(0);
      for (const path of ["tables", "tables/print"]) {
        await page.goto(`${SITES.grill.origin}/${locale}/staff/${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "NotFound.title"));
      }
    });
  }

  test(`grill /${locale}: the owner is offered tables on the dashboard`, async ({ page }) => {
    await signIn(page, SITES.grill, SITES.grill.owner, locale);
    await expect(page.getByRole("link", { name: new RegExp(t(locale, "StaffHome.tablesLink")) })).toBeVisible();
  });
}

// ── Guests ────────────────────────────────────────────────────────────────

test("a guest scans a table's QR code and lands on the menu at that table; a second phone joins the same visit", async ({ page, browser }) => {
  const site = SITES.grill;
  const name = label();
  await open(page, site, "en");
  try {
    await addTable(page, "en", name);
    const url = await scanUrl(row(page, "en", name));

    const a = await guest(browser);
    await a.page.goto(url); // the printed link: no language in it
    await expect(a.page).toHaveURL(/\/(ar|en)\/menu$/); // sent to the restaurant's default language, then the menu
    const lang: Locale = a.page.url().includes("/ar/") ? "ar" : "en";
    await expectLocale(a.page, lang);
    await expect(a.page.getByRole("status").filter({ hasText: t(lang, "Table.banner", { label: name }) })).toBeVisible();
    const sessionA = await sessionCookie(a.page);
    expect(sessionA).toMatch(UUID);
    // HttpOnly: page scripts cannot read it (only the server does).
    expect(await a.page.evaluate(() => document.cookie)).not.toContain("smartmenu_table_session");

    // The banner survives a language switch (same device, same table).
    await a.page.goto(`${site.origin}/en/menu`);
    await expect(a.page.getByRole("status").filter({ hasText: t("en", "Table.banner", { label: name }) })).toBeVisible();

    // Another phone at the same table joins the same session.
    const b = await guest(browser);
    await b.page.goto(url);
    await expect(b.page).toHaveURL(/\/menu$/);
    expect(await sessionCookie(b.page)).toBe(sessionA); // the very same visit
    await expect(b.page.getByRole("status").filter({ hasText: name })).toBeVisible();
    await a.context.close();
    await b.context.close();
  } finally {
    await removeTable(page, site, "en", name);
  }
});

test("renaming a table does not break its printed code, a new QR code kills the old one, and so does switching it off", async ({ page, browser }) => {
  const site = SITES.grill;
  const name = label();
  await open(page, site, "en");
  try {
    await addTable(page, "en", name);
    const oldUrl = await scanUrl(row(page, "en", name));
    /** True when scanning the link takes a guest to the menu (a working code), false when it says "not active". */
    const works = async (url: string) => {
      const g = await guest(browser);
      await g.page.goto(url);
      const ok = /\/menu$/.test(g.page.url());
      await g.context.close();
      return ok;
    };

    // Renamed: the same printed link still works.
    const renamed = `${name} R`;
    await row(page, "en", name).getByLabel(t("en", "Tables.labelField")).fill(renamed);
    await row(page, "en", name).getByRole("button", { name: t("en", "Tables.rename"), exact: true }).click();
    await expect(row(page, "en", renamed)).toBeVisible();
    expect(await works(oldUrl)).toBe(true);

    // Switched off: the code stops working, and says so.
    await row(page, "en", renamed).getByRole("button", { name: t("en", "Tables.deactivate"), exact: true }).click();
    await expect(row(page, "en", renamed).getByText(t("en", "Tables.inactive"), { exact: true })).toBeVisible();
    const off = await guest(browser);
    await off.page.goto(oldUrl);
    await expect(off.page).toHaveURL(/\/scan-invalid$/);
    expect(await sessionCookie(off.page)).toBeNull();
    await off.context.close();
    await row(page, "en", renamed).getByRole("button", { name: t("en", "Tables.activate"), exact: true }).click();
    await expect(row(page, "en", renamed).getByText(t("en", "Tables.active"), { exact: true })).toBeVisible();
    expect(await works(oldUrl)).toBe(true);

    // New QR code: the OLD printed link is dead, the new one works.
    await row(page, "en", renamed).getByRole("button", { name: t("en", "Tables.newQr"), exact: true }).click();
    await expect.poll(() => scanUrl(row(page, "en", renamed))).not.toBe(oldUrl);
    const newUrl = await scanUrl(row(page, "en", renamed));
    expect(await works(oldUrl)).toBe(false);
    expect(await works(newUrl)).toBe(true);
  } finally {
    // Whichever name the table has when the test ends (or fails), it is removed.
    await removeTable(page, site, "en", `${name} R`);
    await removeTable(page, site, "en", name);
  }
});

for (const locale of LOCALES) {
  test(`/${locale}: a made-up or foreign code says it is not active and offers the menu (nothing is stored)`, async ({ page }) => {
    const grill = SITES.grill;
    const coffee = SITES.coffee;
    for (const [site, token] of [
      [grill, "this-token-does-not-exist-123456"],
      [grill, coffee.tables.token], // another restaurant's code on this restaurant's address
      [coffee, coffee.tables.token], // a real table, but dine-in is switched off there
    ] as const) {
      await page.goto(`${site.origin}/${locale}/t/${token}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/scan-invalid$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t(locale, "Table.invalidTitle"));
      await expect(page.getByText(t(locale, "Table.invalidBody"))).toBeVisible();
      await page.getByRole("link", { name: t(locale, "Table.viewMenu") }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/menu$`));
      expect(await sessionCookie(page)).toBeNull(); // nothing is remembered for a code that is not valid
    }
  });
}

test("the printed link on an address that is not a restaurant is a 404", async ({ page }) => {
  // (page.goto would show Chrome's own error page for a 404, so ask for the status directly.)
  const response = await page.request.get("http://127.0.0.1:3000/t/anything-at-all-0123456789", {
    headers: { Host: "no-such-place.localhost:3000" }, // the request client cannot resolve *.localhost names, Chrome can
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
});
