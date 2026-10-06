# SmartMenu

A bilingual (Arabic / English) **smart menu platform for restaurants in Jordan**: customers order from a QR code at the table or ahead for pickup, staff handle orders on any tablet, and owners manage their menu without touching code.
It is the first product toward a full restaurant "Super POS". It runs **alongside** a restaurant's existing POS, so there is nothing to replace.

One codebase serves every restaurant (multi-tenant). Each restaurant lives on its own subdomain (`<restaurant>.ourapp.com`), and its behaviour is set in the database, never by custom code.

> Full product spec: [`PROJECT_SPEC.md`](PROJECT_SPEC.md) · Detailed working log: [`docs/PROGRESS.md`](docs/PROGRESS.md)

---

## Status

**Current phase: 3 — Menu & owner portal (in progress)**

| Phase | What | Status |
|---|---|---|
| 0 | Planning, spec, coding rules | ✅ Done |
| 1 | Foundation: Next.js skeleton, CI on every push | ✅ Done (cloud deploy postponed, running on localhost) |
| 2 | Core backend: restaurants, roles, staff login, data isolation, settings | ✅ Done |
| 3 | Menu & owner portal | 🟡 In progress |
| 4 | Customer ordering (menu, cart, dine-in QR, takeout) | ⬜ Not started |
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
  - Owner, manager **and waiters** can mark items **sold out / back in stock** during service.
  - Cashiers can view the menu but not change it.
- **Menu rules.**
  - Prices are stored as whole **fils** (JOD has 3 decimals).
  - "Hidden" means invisible to customers. "Sold out" means visible but not orderable.
  - Deleting is soft, so past orders keep their data.
  - An item can never belong to another restaurant's category; the database itself enforces this.
- **Quality gates.** CI runs typecheck, lint (including architecture-layer import rules), unit tests and a production build on every push. Database security tests (pgTAP) and integration tests run locally.

### ⬜ Not done yet (next up)

- **Phase 3 (now):**
  - reorder categories and items
  - restaurant branding (waiting on a decision, see below)
- **Phase 4+:** everything customer-facing, including:
  - the public customer menu
  - cart and ordering
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

- Exact list of **branding elements** owners can edit (blocks the branding part of Phase 3).
- Can confirmed order items be **removed**, or only added? (Phase 4/5)
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
