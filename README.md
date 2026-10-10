# SmartMenu

A bilingual (Arabic / English) **smart menu platform for restaurants in Jordan**: customers order from a QR code at the table or ahead for pickup, staff handle orders on any tablet, and owners manage their menu without touching code.
It is the first product toward a full restaurant "Super POS". It runs **alongside** a restaurant's existing POS, so there is nothing to replace.

One codebase serves every restaurant (multi-tenant). Each restaurant lives on its own subdomain (`<restaurant>.ourapp.com`), and its behaviour is set in the database, never by custom code.

> Full product spec: [`PROJECT_SPEC.md`](PROJECT_SPEC.md) · Detailed working log: [`docs/PROGRESS.md`](docs/PROGRESS.md)

---

## Status

**Current phase: 4 — Customer ordering (Phase 3, the menu and owner portal, is finished)**

| Phase | What | Status |
|---|---|---|
| 0 | Planning, spec, coding rules | ✅ Done |
| 1 | Foundation: Next.js skeleton, CI on every push | ✅ Done (cloud deploy postponed, running on localhost) |
| 2 | Core backend: restaurants, roles, staff login, data isolation, settings | ✅ Done |
| 3 | Menu & owner portal | ✅ Done |
| 4 | Customer ordering (menu, cart, dine-in QR, takeout) | 🟡 Started (orders work behind the scenes: rules, database, saving and moving them; no customer screens yet) |
| 5 | Staff order screen (live orders, sound alert, SMS when ready) | ⬜ Not started |
| 6 | Onboarding tools (presets, bulk/AI menu import, custom domains) | ⬜ Not started |
| 7 | Installable app (PWA) & push notifications | ⬜ Not started |
| 8 | Hardening (security review, load tests, monitoring, backups) | ⬜ Not started |
| 9–10 | Pilot restaurant, launch | ⬜ Not started |

### ✅ Done: major features

- **Multi-restaurant from day one.** Every table carries `restaurant_id`, and Postgres Row Level Security keeps each restaurant's data invisible to the others. Automated database tests check this on every change.
- **Restaurant per subdomain.** `demo-dinein.localhost:3000` shows Demo Grill, `demo-takeout.localhost:3000` shows Demo Coffee, and unknown subdomains get a 404.
- **Arabic + English, right-to-left.** URLs are `/ar/...` and `/en/...`. Arabic is the default, the layout is RTL, the font is IBM Plex Sans Arabic, there's a language switch, all text is translated, and prices use Western digits (`4.500 د.أ` / `4.500 JD`).
- **Staff login.** Email + password, with no public sign-up (the founders create accounts). Staff can only sign in on their own restaurant's site, and their session is separate per restaurant.
- **Roles.** Owner, Manager, Waiter and Cashier, each with its own permissions, enforced both in the app and in the database.
- **Menu management.** Staff see the menu by category with prices.
  - Owner and manager can **add and edit items**: Arabic + English name and description, price, category. Prices are typed in JD (`4.5`, `4.500`, or Arabic digits `٤٫٥`) and stored exactly as fils. Validation errors are translated and shown next to the right field.
  - Owner and manager can **add, rename, hide and delete categories**. A category can only be deleted when it's empty, so nothing disappears by surprise.
  - Owner and manager can **delete items** (with an "are you sure?" step). Deleting is soft, so past orders keep the item's name and price.
  - Owner and manager can **hide or show** items. Hiding a category hides everything in it from customers.
  - **Item photos.** Owner and manager can upload, replace or remove one photo per item (JPG / PNG / WebP, up to 5 MB). Photos show as thumbnails on the menu screen.
    - Files are checked by their actual content, so a disguised file (e.g. HTML renamed `.jpg`) is rejected.
    - Each restaurant can only write into its own storage folder; the database storage rules enforce this.
    - Photos are publicly viewable, ready for the customer menu.
  - **Option groups (modifiers).** Owner and manager create reusable groups like "Size" (Regular / Large +2.000) or "Extras" once, then attach them to any items.
    - Each group sets how many options a customer must or may pick (e.g. *required · choose 1*, or *optional · up to 3*).
    - Options can add an extra price (in fils) or be free.
    - The rules that will check a customer's picks and compute the final price are already built and tested, ready for ordering in Phase 4.
    - Items on the menu screen show which groups they offer.
  - **Reordering.** ↑ / ↓ buttons for categories, items (within their category) and options.
- **Fast staff screens.** Toggles respond instantly (optimistic UI). In a production build, a save takes ~100–140 ms and opening a page ~90 ms. The login check is verified locally (no extra round trip), and forged tokens are rejected (tested).
  - Owner, manager **and waiters** can mark items **sold out / back in stock** during service.
  - Cashiers can view the menu but not change it.
- **Menu rules.**
  - Prices are stored as whole **fils** (JOD has 3 decimals).
  - "Hidden" means invisible to customers. "Sold out" means visible but not orderable.
  - Deleting is soft, so past orders keep their data.
  - An item can never belong to another restaurant's category; the database itself enforces this.
- **Order rules (Phase 4, rules only, no screen yet).** The core logic for dine-in orders is built and tested.
  - An order moves **NEW → CONFIRMED → PREPARING → READY → SERVED → COMPLETED**, one step at a time (no skipping or going back).
  - Each order **copies the item names, prices and chosen options at the moment of ordering**, so later menu edits never change a past order.
  - Totals are exact whole fils: service charge on the subtotal, then tax on subtotal + service, each rounded half up. Rates are saved on the order.
  - Hidden, sold-out or deleted items, other restaurants' items, wrong option picks and bad quantities are rejected.
  - Ordering more after confirming creates a new order in the same visit, starting again at NEW.
- **Orders in the database (Phase 4, no screen yet).** Tables for orders, their lines and chosen options now exist, with the same protections as the menu.
  - Each restaurant gets its own order numbers (1, 2, 3 …), and a restaurant can never see another's orders (database tests prove it).
  - A placed order is frozen: names, prices, totals and tax rates can't be edited. Staff can only move the status forward one step (NEW → CONFIRMED → PREPARING → READY → SERVED → COMPLETED), and the database itself refuses skipping or going back.
  - Orders can't be deleted. **Who moves an order:** the owner and manager any step, the waiter up to SERVED, and the cashier only the last step (COMPLETED, after the customer has paid). The database enforces this split, not just the screens.
  - **Placing and moving orders works behind the scenes now.** The app can take a cart, check every line against the live menu, compute the totals and save the whole order in one all-or-nothing step (a bad cart never uses up an order number). Staff can read the open orders and move them along. Covered by tests against the real database. Customer screens come next.
- **Database permissions tightened.** A check found that newer Supabase versions hand every table's full rights to logged-in users by default. A new migration pins the older tables to exactly the rights they need (e.g. staff can never hard-delete menu items), and future tables no longer get the extra rights.
- **Branding (owner only).** The owner uploads a **logo**, picks **one accent colour** from 8 ready-made ones (all stay readable with white text, checked by a test) and writes the **restaurant name, tagline, about text, address, phone and opening hours** in Arabic and English.
  - It appears right away on the restaurant's public page: coloured header, logo, both names, tagline and details (empty parts are simply left out).
  - Logos are JPG, PNG or WebP up to 2 MB (checked by the file's real content; SVG is refused because it can carry scripts). Only the owner can change branding, and only for their own restaurant.
  - Saving the name and the branding together is all-or-nothing.
- **Restaurant settings (owner only).** The owner chooses which order types are on (dine-in, takeout, delivery), the tax rate, the service charge and the default customer language.
  - Percentages are typed normally (`16`, `10.5`, even Arabic digits `١٠`) and stored exactly (basis points, no rounding errors).
  - Only the owner sees the screen. Other staff can't open it, and the database refuses their changes too (tested).
  - New orders use the new rates; orders already placed keep theirs.
- **Language switch fixed.** Switching between العربية and English on the staff pages now changes all the text, not only the page direction. (The cause was the loading skeleton forcing Arabic for the whole request.) Menu items still show both language names side by side, by design.
- **Browser tests.** 66 automated end-to-end tests drive a real browser through the app on both demo restaurants, in English and Arabic: login, language switch, roles, menu, settings and branding. They change data and put it back. Run with `npm run test:e2e` (needs the local database).
- **Quality gates.** CI runs typecheck, lint (including architecture-layer import rules), unit tests and a production build on every push. Database security tests (pgTAP) and integration tests run locally.

### ⬜ Not done yet (next up)

- **Phase 4 (next):** the public menu for customers and the cart, table sessions and QR codes, then placing an order from the customer screens (the saving side already works).
- **Phase 4+:** everything customer-facing, including:
  - the public customer menu
  - cart and ordering screens
  - table sessions and QR codes
  - takeout
  - the live staff order screen
  - SMS / push notifications
  - reports
  - loyalty points
  - AI menu import and ordering assistant
  - custom domains
  - cloud deployment (Vercel + Supabase)

### Open decisions (blocking specific features only)

- Can confirmed order items be **removed**, or only added? (Phase 4/5) Also **order cancellation** rules.
- Is **tax charged on top of the service charge**? (assumed yes for now; one function to change)
- How **takeout/delivery** maps onto the table-session model. (Phase 4)
- **Loyalty** earn/redeem rules.

---

## Tech stack

- **Next.js 15 + React 19 + TypeScript (strict)**, Tailwind CSS v4, `next-intl` for translations
- **Supabase** (Postgres, Auth, Row Level Security, Storage; later Realtime) running locally in Docker
- **Vitest** (unit + integration), **pgTAP** (database security tests), ESLint (also enforces architecture layers)
- Hosting plan: **Vercel + Supabase**

### Architecture (Clean Architecture)

```
src/domain/          pure business rules (no frameworks): restaurant, menu, money, …
src/application/     use cases + ports (interfaces), e.g. signInStaff, addMenuItem
src/infrastructure/  Supabase adapters; container.ts wires everything together
src/interface/web/   UI components, server actions, i18n, formatting
src/app/             Next.js routes (thin)
supabase/            migrations, seed data, database tests
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
- http://demo-dinein.localhost:3000 for the **Demo Grill** restaurant page (Arabic; use the switch for English)
- http://demo-dinein.localhost:3000/ar/staff/login for **staff login**, then the menu screen at `/ar/staff/menu`

Demo staff accounts (local only): `owner@demo-dinein.test`, `waiter@demo-dinein.test`, `cashier@demo-dinein.test`, `owner@demo-takeout.test`. The password is in [`supabase/seed.sql`](supabase/seed.sql).

### Tests

```bash
npm run check             # typecheck + lint + unit tests + build (same as CI)
npm run test:integration  # real adapters against the local database
npx supabase test db      # database security tests (tenant isolation, roles)
```

---

## Team

Nour (DevOps, security, infrastructure) · Abdullah (data model, portal, menu, staff screens) · Omar (AI, notifications, E2E tests)
