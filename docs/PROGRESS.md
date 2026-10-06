# Progress log

Read this after `PROJECT_SPEC.md` at the start of every session. Update it at the end of every iteration.

## Decisions made so far
- Hosting: Vercel + Supabase, but **localhost only for now** (Vercel setup postponed until there is real progress).
- Local database: Supabase CLI in Docker (`npx supabase start`).
- Tooling: Next.js 15 + React 19 + strict TS, Tailwind v4, Vitest, ESLint layer rules, `next-intl` (planned), pgTAP DB tests.
- Defaults: Arabic is the default language; Western digits in both languages; only OWNER changes restaurant settings.
- Tax/service-charge preset values are placeholders and adjustable later (owner setting) — not a blocker.
- Table session states (planned): `OPEN -> PAYMENT_REQUESTED -> CLOSED`.
- Public (logged-out) reads go through narrow SECURITY DEFINER functions with an explicit column list, never the service-role key and never direct anon table grants (decided 2026-10-06).
- Gotcha: `npm run check` (next build) overwrites `.next` and breaks a running `npm run dev` (500s) — restart the dev server after it.
- Staff auth: email + password; public sign-up OFF; staff accounts created by founders (seed / setup tool) for now, owner invites later (decided 2026-10-06).
- Gotcha: read the host via `getCurrentSite()` only. After a Server Action redirect, Next re-fetches the page from
  `localhost:3000` internally, so the raw `host` header is wrong there; `x-forwarded-host` keeps the real one.
- Gotcha: after Docker restarts, `npx supabase start` may say "already running" while containers are stopped ->
  `npx supabase stop` then `npx supabase start` (data is kept in the Docker volume).
- Menu rules (decided 2026-10-06, Phase 3): hidden = invisible to customers; sold out = visible but not orderable; delete = soft;
  price 0 allowed; both names required. All staff read the menu; OWNER/MANAGER edit it; WAITER may only toggle sold out
  (`menu:sold-out`, DB function `set_menu_item_sold_out`).
- Gotcha: CI uses npm 11 (installed in the workflow). Node 22's bundled npm 10 rejects lock files written by npm 11
  (CI failed on 76f788e..cb45e37 for this reason). Use npm 11 locally too.
- Working style: very small iterations, one at a time; Nour approves each. Show every visible change on http://localhost:3000.

## Done
- Phase 0: spec, CLAUDE.md, skills (`architecture-rules`, `data-model`, `arabic-rtl`).
- Phase 1 step 1: Next.js skeleton + layer folders. Step 2: GitHub Actions CI (`npm run check`). Deploy: postponed.
- Phase 2 step 1: restaurant domain — `src/domain/restaurant/` (slug, bilingual name, settings + presets, roles/permissions) with unit tests. Passing.
- Phase 2 step 2: local Supabase + migration for `restaurants`, `restaurant_settings`, `restaurant_members` with RLS; pgTAP isolation test (12 tests); seed with 2 demo restaurants.
- Fix: migration `20261006000100_grant_table_privileges.sql` (new Supabase doesn't auto-grant table privileges).
- Verified 2026-10-06: `npx supabase db reset` + `npx supabase test db` -> `Tests=12`, all pass; `npm run check` green (typecheck, lint, 19 unit tests, build).
- Phase 2 step 3 (app <-> DB), done as small iterations:
  - 3a DB: public read path `get_public_restaurant(slug)` (SECURITY DEFINER, fixed safe column list; anon still has no table access) + pgTAP `public_restaurant.test.sql` (8 tests). `npx supabase test db` -> `Tests=20`.
  - 3b `RestaurantRepository` port + Supabase client/adapter (publishable key, calls the RPC) + `.env.example`.
  - 3c `getPublicRestaurant` use case (+ unit tests with a fake repo).
  - 3d Tenant from subdomain (`slugFromHost`, domain) + composition root `src/infrastructure/container.ts`; `/` shows the restaurant name (default language first, other below). Root layout now `lang="ar" dir="rtl"`.
    Look at: http://demo-dinein.localhost:3000 (Demo Grill) and http://demo-takeout.localhost:3000; unknown subdomain -> 404; plain http://localhost:3000 -> "SmartMenu".

- Phase 2 step 4 (staff login: email + password; founders create accounts):
  - 4a DB: public sign-up disabled (`supabase/config.toml`), 4 demo staff seeded (owner/waiter/cashier @demo-dinein.test, owner@demo-takeout.test; password in `supabase/seed.sql`).
  - 4b Application: `AuthGateway` + `MembershipRepository` ports; `signInStaff` (non-members get the same error as a wrong password and are signed out) and `getStaffContext`; unit tests.
  - 4c Infrastructure: Supabase adapters, cookie sessions via `@supabase/ssr`, `src/middleware.ts` refreshes sessions on `/staff/*` only.
    `npm run test:integration` runs the real adapters against local Supabase (3 tests).

- Phase 2 step 5b: staff login UI. `/<locale>/staff/login` (email + password, translated errors) -> `/<locale>/staff`
  (restaurant + role, sign out). Server actions in `src/interface/web/staff/actions.ts`; tenant ALWAYS from the host via
  `getCurrentSite()` (`src/interface/web/current-site.ts`), never from the form. Pages now have an explicit light theme.
    Look at: http://demo-dinein.localhost:3000/ar/staff/login (demo accounts + password in `supabase/seed.sql`).
    Verified in browser: wrong password -> error; waiter/owner -> dashboard with role; sign out; Grill owner refused on demo-takeout
    (same error, no session) while their Grill session stays active.

- Phase 3 step 1 (domain): `src/domain/menu/menu.ts` — categories + items, bilingual names (both required, max 80),
  optional descriptions (max 500), price as `Fils` (`src/domain/shared/money.ts`, whole fils 0..1,000,000 JD), sort order,
  hidden (customers don't see it) vs sold out (shown, not orderable), soft delete, items only in a live category of the
  same restaurant. `isVisibleToCustomers` / `isOrderable`. Unit tests.
- Phase 3 step 2 (DB): migration `menu_categories_items` — RLS (all staff read; OWNER/MANAGER write), composite FK
  (item's category must be in the same restaurant), column grants (restaurant_id can't change), no hard delete, anon no
  access. pgTAP `menu_isolation.test.sql` (20). `npx supabase test db` -> `Tests=40`. Seed: demo menus for both restaurants.

- Phase 3 step 3: `MenuRepository` port + `SupabaseMenuRepository` (insert/update split because of column grants;
  setItemSoldOut checks the item's restaurant then calls the DB function). Integration tests (`menu.integration.test.ts`).
- Phase 3 step 4: menu use cases in `src/application/use-cases/menu/` (get staff menu, add category/item, edit item,
  hide, sold out, delete) — each checks `menu:manage` or `menu:sold-out` for the server-resolved actor. Clock/IdGenerator ports.
- Phase 3 step 5: staff menu screen `/<locale>/staff/menu` (linked from the staff dashboard): categories + items, both
  names, prices via `formatPrice` (`src/interface/web/format.ts`, Western digits), sold-out/hidden badges, sold-out toggle
  (owner/manager/waiter) and hide/show (owner/manager). `requireStaff()` guards every staff page/action.
    Look at: http://demo-dinein.localhost:3000/ar/staff/menu — sign in as owner (all buttons) or waiter (sold out only).
- CI fixed (b996db9): workflow installs npm 11 (see gotcha below).

## In progress / verify first
- Nothing pending.

## Next
- Phase 3 step 6: add / edit item form (names, descriptions, price in JD -> fils, category) with translated validation errors.
- Then: add / rename / hide / delete categories; delete item (with confirm).
- Later in Phase 3: item photos (Supabase Storage), options/modifiers (size, extras), branding (needs the open question answered).

## Open questions (do not build without asking) — see spec §12
- Removing items after order confirmation; takeout/delivery session model; loyalty rules; exact branding elements.
