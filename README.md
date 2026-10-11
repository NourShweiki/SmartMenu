# SmartMenu

A bilingual (Arabic / English) **smart menu platform for restaurants in Jordan**: customers order from a QR code at the table or ahead for pickup, staff handle orders on any tablet, and owners manage their menu without touching code.
It is the first product toward a full restaurant "Super POS". It runs **alongside** a restaurant's existing POS, so there is nothing to replace.

One codebase serves every restaurant (multi-tenant). Each restaurant lives on its own subdomain (`<restaurant>.ourapp.com`), and its behaviour is set in the database, never by custom code.

> Full product spec: [`PROJECT_SPEC.md`](PROJECT_SPEC.md) · Detailed working log: [`docs/PROGRESS.md`](docs/PROGRESS.md)

---

## Status

**Current phase: 6 — Onboarding tools.** Dine-in works end to end: a guest scans a table, orders, follows the order on their phone; staff run the orders and the tables; the owner manages menu, branding and settings; the SmartMenu team can create a new restaurant with its owner in a minute. Everything runs on a developer machine for now (no cloud deployment yet).

| Phase | What | Status |
|---|---|---|
| 0 | Planning, spec, coding rules | ✅ Done |
| 1 | Foundation: Next.js skeleton, CI on every push | ✅ Done (cloud deploy postponed, running on localhost) |
| 2 | Core backend: restaurants, roles, staff login, data isolation, settings | ✅ Done |
| 3 | Menu & owner portal | ✅ Done |
| 4 | Customer ordering (menu, cart, dine-in QR, takeout) | ✅ Dine-in done · takeout is designed and gets built inside Phase 6 |
| 5 | Staff order screen (live orders, sound alert, order-ready notice) | ✅ Done (SMS left out for now, on purpose) |
| 6 | Onboarding tools (setup tool, staff accounts, takeout, checklist, menu import, custom domains) | 🟡 In progress: step 1 of 7 done (the team's setup tool, with passwords); step 2 (staff accounts): rules and logic built and tested, the screen is next |
| 7 | Installable app (PWA) & push notifications | ⬜ Not started |
| 8 | Hardening (security review, load tests, monitoring, backups) | ⬜ Not started |
| 9–10 | Pilot restaurant, launch | ⬜ Not started |

### ✅ What works today

#### The platform
- **Multi-restaurant from day one.** Every table carries `restaurant_id`, and Postgres Row Level Security keeps each restaurant's data invisible to the others. Automated database tests check this on every change.
- **Restaurant per subdomain.** `demo-dinein.localhost:3000` shows Demo Grill, `demo-takeout.localhost:3000` shows Demo Coffee, and unknown subdomains get a 404.
- **Arabic + English, right-to-left.** URLs are `/ar/...` and `/en/...`. Arabic is the default, the layout is RTL, the font is IBM Plex Sans Arabic, there is a language switch on every screen, all text is translated, and prices use Western digits (`4.500 د.أ` / `4.500 JD`).
- **Money is exact.** Prices are whole **fils** (JOD has 3 decimals). An order copies item names, prices, chosen options and the tax / service rates at the moment of ordering, so later menu or settings changes never touch a past order.

#### For the SmartMenu team (founders)
- **Setup tool** on the platform's own address (`/en/setup`): founders sign in, see every restaurant, and create a new one: names, web address, business type (dine-in or takeout, which sets the starting settings) and the owner's email.
  - The restaurant, its settings and the owner's account are created together or not at all. A form that is sent twice creates nothing the second time.
  - The owner's **temporary password** is shown once, to pass on. Only founders get in: a restaurant's staff are refused like a wrong password, and the tool does not exist on a restaurant's own address.
  - The list shows each restaurant's owner. If a password was never passed on or the owner forgot it, a founder issues a **new temporary password** with one button: the old password stops working at once.

#### For staff
- **Login.** Email + password, with no public sign-up. Staff can only sign in on their own restaurant's site, and sessions are separate per restaurant.
- **Passwords.** Everyone can change their own password (the current one is asked for). Somebody who signs in with a temporary password gets one page only, "choose your own password", until they have done so.
- **Roles.** Owner, Manager, Waiter and Cashier, each with its own permissions, enforced both in the app and in the database.
- **Orders screen.** The restaurant's open orders, oldest first: number, table, what was ordered with its choices, total and time.
  - Each order has one button for the next step that person may take: the waiter moves an order from new to confirmed, preparing, ready and served; the cashier completes it after payment; the owner and manager can do every step.
  - **Cancelling** asks for a reason. The waiter may cancel before the kitchen starts, the owner and manager any order that is not completed, the cashier never. A cancelled order is kept, crossed out at zero on the bill.
  - The screen keeps itself up to date: a new order appears within about 5 seconds, with a notice and (once switched on) a sound.
- **Open tables screen.** Every table that has guests, with its orders and running bill. The waiter marks a table **ready to pay** (its guests can then no longer order); the cashier **closes the table** after payment. A table cannot be closed while an order is unfinished. A visit closes by itself after 2 hours.
- **Sold out.** Owner, manager and waiters mark items sold out / back in stock during service.

#### For the owner (and manager)
- **Menu.** Categories and items with Arabic + English names and descriptions, prices, photos, hide / show, soft delete, reorder. Prices are typed in JD (`4.5`, `4.500`, or Arabic digits `٤٫٥`).
- **Option groups.** Reusable groups like "Size" or "Extras" (required or optional, with extra prices), attached to any items.
- **Tables and QR codes.** Add tables and print a QR card for each. The code holds a long random token, not the table number: renaming never breaks a printed code, and a lost code is replaced with one click.
- **Branding (owner only).** Logo, one accent colour from 8, and the restaurant's name, tagline, about text, address, phone and opening hours in both languages. It shows at once on the public page.
- **Settings (owner only).** Which order types are on, tax rate, service charge, default customer language.

#### For customers
- **Menu and cart.** No login, no app: categories, items with photos and prices, choices (size, extras ...), a cart with an estimate including service charge and tax. Sold-out items are shown but cannot be added.
- **Ordering from the table.** Scan the table's QR code, fill the cart, press **Place order**, get an order number. Everyone at the table shares one visit and can keep ordering. Pressing the button twice, or a lost reply on weak Wi-Fi, never produces a second order.
- **Following the order.** The menu page shows **Your orders** with how far each has got, on every phone at the table. When an order is ready a notice appears by itself (with a sound, a vibration, and a system notification where the phone allows it); a cancelled order is announced too.
- The phone only sends what is in the cart. The restaurant, the table, the prices and the rates all come from the server's own side.

#### Quality
- **Automated tests:** 413 unit tests, 40 integration tests against a real local database, 375 database security tests (tenant isolation, roles, privileges), and 145 end-to-end tests that drive a real browser through both demo restaurants in English and Arabic.
- The browser tests build the app for production and start that build themselves, so they check the code in the form users get; they remove everything they create.
- **CI** runs typecheck, lint (including the architecture-layer import rules), unit tests and a production build on every push. Database, integration and browser tests run locally (CI has no database yet).

### ⬜ Not done yet

- **Phase 6 (in progress): onboarding a new restaurant in under a day.** In this order:
  1. ~~the team's setup tool: create a restaurant with its first owner, change passwords, replace a temporary password at first sign-in, issue a new temporary password~~ ✅
  2. **in progress:** staff accounts managed by the owner and the manager. The rules are decided, and the database part and the logic behind it are built and tested against a real database (adding a member with a temporary password, changing a role, removing, re-hiring, a new temporary password). Only the screen is missing, so today a restaurant's other staff can still only be added in the database. The rules:
     - the owner and the manager add managers, waiters and cashiers, each with a temporary password; owners are created by the SmartMenu team
     - nobody can change or remove themselves, and a restaurant always keeps at least one owner
     - an email that is in use at another restaurant is refused; somebody who was removed can be hired again
     - removing somebody takes them out of the restaurant but keeps their account, so past orders still know who handled them
  3. **takeout ordering** (designed: a pickup order with the customer's name and mobile number, followed on their phone like a table order). Until then a takeout-only restaurant such as Demo Coffee shows its menu but cannot take orders
  4. a setup checklist for the owner
  5. menu import from a spreadsheet
  6. menu import by AI from a photo or PDF
  7. custom domains
- **After that:** the installable app with push notifications that reach a locked phone, SMS, reports, loyalty points, the AI ordering assistant, delivery, and cloud deployment (Vercel + Supabase).

### Known limits (on purpose, for now)

- The "order is ready" system notification only works while the menu page is still open in the browser.
- The team's setup tool is protected by a password only (a second factor comes with the hardening phase).
- An email address can belong to one account, so one person cannot yet own two restaurants under the same email.

### Open decisions (each blocks one feature only)

- May staff remove **single items** from a placed order, or only cancel the whole order?
- How **delivery** maps onto the table-visit model (addresses, fees, drivers).
- **Loyalty** earn / redeem rules.
- Is **tax charged on top of the service charge**? (yes for now; one function to change)

---

## Tech stack

- **Next.js 15 + React 19 + TypeScript (strict)**, Tailwind CSS v4, `next-intl` for translations
- **Supabase** (Postgres, Auth, Row Level Security, Storage) running locally in Docker. Live screens refresh themselves every few seconds for now; Supabase Realtime can replace that later
- **Vitest** (unit + integration), **pgTAP** (database security tests), **Playwright** (end-to-end, real Chrome), ESLint (also enforces architecture layers)
- Hosting plan: **Vercel + Supabase**

### Architecture (Clean Architecture)

```
src/domain/          pure business rules (no frameworks): restaurant, menu, money, …
src/application/     use cases + ports (interfaces), e.g. signInStaff, addMenuItem
src/infrastructure/  Supabase adapters; container.ts wires everything together
src/interface/web/   UI components, server actions, i18n, formatting (customer/, staff/, setup/)
src/app/             Next.js routes (thin)
supabase/            migrations, seed data, database tests
e2e/                 browser tests (Playwright)
messages/            ar.json / en.json translations
```

Dependencies point inward only (`app → interface → application → domain`), and the linter blocks the reverse.

---

## Run it locally

Requirements: **Node 22**, **npm 11**, and **Docker Desktop** running.

```bash
npm install
npx supabase start          # local database + auth (first run downloads images)
npx supabase db reset       # build the database from migrations + demo data
cp .env.example .env.local  # then fill in the values from `npx supabase status`
npm run dev
```

The dev server is slower than the real app (it compiles pages on demand). To feel the real speed:
`npm run build` then `npm start`.

Then open:
- http://demo-dinein.localhost:3000 for **Demo Grill** (dine-in; Arabic first, use the switch for English) and http://demo-takeout.localhost:3000 for **Demo Coffee** (takeout only)
- http://demo-dinein.localhost:3000/en/staff/login for **staff login**: orders, open tables, menu, tables and QR codes, settings, branding
- http://demo-dinein.localhost:3000/en/staff/tables to copy a table's QR link, which is how a customer "scans" a table on a computer
- http://localhost:3000/en/setup for the **team's setup tool** (note: no restaurant name in front of `localhost`)

Careful on the setup tool: **New temporary password** really replaces that owner's password, also for the demo owners (`npx supabase db reset` brings the demo passwords back).

Demo accounts (local only): `owner@demo-dinein.test`, `waiter@demo-dinein.test`, `cashier@demo-dinein.test`, `owner@demo-takeout.test`, and the founder `founder@demo-platform.test` for the setup tool. The password is in [`supabase/seed.sql`](supabase/seed.sql).

### Tests

```bash
npm run check             # typecheck + lint + unit tests + build (same as CI)
npm run test:integration  # real adapters against the local database
npx supabase test db      # database security tests (tenant isolation, roles)
npm run test:e2e          # browser tests: builds the app and starts it on port 3100 by itself (about 10 minutes)
```

The last three need the local database (`npx supabase start`). They clean up after themselves and leave the demo data as it was.

---

## Team

Nour (DevOps, security, infrastructure) · Abdullah (data model, portal, menu, staff screens) · Omar (AI, notifications, E2E tests)

