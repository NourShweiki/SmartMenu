# Progress log

Read this after `PROJECT_SPEC.md` at the start of every session. Update it at the end of every iteration.

## START HERE (handoff written 2026-10-11: dine-in ordering is finished, Phase 5 is next)
**Where we are:** Phases 0-3 are done. Phase 4 (customer ordering) is done for DINE-IN: public menu + cart (4a), tables / QR codes / table sessions (4b), placing an order from the cart (4c), and placing is safe to repeat (one order per submission). Takeout is NOT built: it waits for its open question. Staff have NO screen for orders yet.
**NEXT TASK = Phase 5, the staff order screen** (Nour, 2026-10-11: "we need to finish everything so we could start with phase 5"; everything before it is finished). One layer at a time, in this order, each a small iteration that Nour approves: (1) DONE 2026-10-11: which table an order belongs to (`orders.getForStaff` returns each order with its table label and the visit's status); (2) DONE 2026-10-11: moving a table session (`tableSessions.move(actor, { sessionId, to })`); (3) DONE 2026-10-11: the staff order screen `/<locale>/staff/orders` (queue, status buttons by role); (3b) DONE 2026-10-11: the open tables screen `/<locale>/staff/open-tables` (each live visit with its running bill, "ready to pay", "close table"; closing refused while orders are unfinished); (4) cancelling: rules, database and storage DONE 2026-10-11 (`orders.cancel(actor, { orderId, reason })`); STILL TO DO: the button with its reason on the order screen, cancelled orders struck through on the open tables bill, messages, E2E; (5) live updates + sound alert (nothing is in the `supabase_realtime` publication yet; decide realtime vs polling, and how a browser subscribes without importing Supabase outside infrastructure); (6) the READY notice for guests (on the menu page of the session's devices + a web notification where allowed; needs a public way for a guest to read their orders' status, and `src/infrastructure/notifications/` is empty).
**Decided by Nour, 2026-10-11 (all in PROJECT_SPEC.md §4):** dine-in guests are notified at READY too: on the phones that joined the table session and, where possible, as a web notification; NO SMS for now. ONLY STAFF can cancel an order; customers cannot cancel or remove items. NO kitchen role or screen: the waiter moves every step up to SERVED. Cancelling details were left to us ("choose what's best") and are recorded in the spec as OUR choice, to change if wrong: waiter may cancel while NEW or CONFIRMED; owner / manager any order not yet COMPLETED; cashier never; a cancelled order is kept (who, when, reason from a fixed list), is final, counts as zero on the bill, and the guests see it. The local database is left as it is (test orders stay until Nour asks for a reset).
**Fixed 2026-10-11: pages that stayed stale after a save, in PRODUCTION builds only (a React bug, worked around).** Symptom: on `/staff/menu`, "Mark sold out" saved but the screen kept the flipped button with no badge until a reload (5 of 6 sold-out E2E tests failed on production, never on dev). Cause, traced in the React copy Next 15.5.27 ships (`next/dist/compiled/react-dom`, 19.2.0-canary-0bdb9206-20250818): when a Server Action or `router.refresh()` updates the page already on screen, React renders while the reply is still streaming; if a row arrives between React suspending on it and attaching its wake-up, the wake-up fires synchronously INSIDE the render (`pingSuspendedRoot` with exit status "suspended with delay" neither restarts nor records it) and `markRootSuspended` then clears it. All data has arrived, React waits forever. It is NOT the toggle (a plain-state rewrite stuck just as often) and NOT the server (replies are complete). 15.5.27 is the newest 15.5, so no patch release fixes it. Workaround: `interface/web/components/stuck-render-guard.tsx`, mounted once in `app/[locale]/layout.tsx`: after every finished request to our own origin (PerformanceObserver, "resource" entries) it makes an empty state update, and any new update makes React retry suspended work. Result: toggle 10/10 on production, full suite 118/118. REMOVE the guard after a Next / React upgrade if `e2e/staff-menu.spec.ts` passes on a production build without it. Anything that refreshes a page in place (Phase 5 status buttons, live order list) depends on it until then.
**Browser tests (changed 2026-10-11): just run `npm run test:e2e`.** Playwright now BUILDS the app for production and starts that build itself on port 3100 in its own folder `.next-e2e` (`e2e/support/server.ts`, `playwright.config.ts`, `NEXT_DIST_DIR` in `next.config.ts`), then stops it. Nothing else has to run; a dev server on port 3000 is not used and not disturbed (proved: the suite passed with `npm run dev` running). The build adds about a minute. Why production: on the dev server this 8 GB machine gave 9-11 false failures per run (sign-ins timing out, the dev server restarting itself) and one real fault only showed on production. If a run is killed, its server may stay on port 3100 and the next run says the port is used: stop that node process. `E2E_REUSE_SERVER=1` reuses a test server you started yourself (see the comment in `playwright.config.ts`); you must rebuild it after changing the app. After a run `next-env.d.ts` points at `.next-e2e`; if you delete `.next-e2e` or `.next` and `npm run typecheck` then says a file is missing (TS6053), delete `tsconfig.tsbuildinfo` and start `npm run dev` (or run a build) once. The test build still type-checks the dev server's `.next/types` (tsconfig `include`): stale files there can fail it; delete `.next/types`.
**After Phase 5 step 4 part A (2026-10-11):** typecheck, lint, 350 unit, 31 integration, 280 pgTAP: green. Browser suite (129 tests): NOT re-run since step 3b, where the full run had 3 failures from one faulty new test (fixed; the two affected specs then passed 29 of 29). Run the full suite with step 4's screens.
**Last full results before Phase 5 (2026-10-11):** browser suite 119 passed in 5.5 min (including the build), with the dev server running alongside. typecheck, lint, 299 unit, 28 integration, 249 pgTAP: green.
**Still open from the reviews (none blocks Phase 5; ask Nour before building):** no rate limit on the public `placeOrderAction` (Phase 8 hardening); `src/infrastructure/customer-order.integration.test.ts` imports the interface layer (a deliberate exception for a wiring test, not recorded in the `architecture-rules` skill); the UUID pattern is defined in several files (move to `domain/shared`); a known submission key returns the earlier order without comparing its contents with the cart sent now (needs a client fault to matter); `keyStore()` in `customer-menu.tsx` repeats the guarded localStorage access of `use-cart.ts`; `domain/restaurant` imports `validateName` / image detection from `domain/menu`; branding saves overwrite the whole record (no version column).
**Decided by Nour, 2026-10-10 (all recorded below and in PROJECT_SPEC.md):** cashier completes orders after payment; branding = logo + 8-colour accent + written details; QR codes carry a random token; **a table session closes automatically 2 hours after it starts** (database: `session_ttl()`, migration `session_expiry`; domain: `SESSION_MAX_AGE_HOURS`, `isSessionExpired`, `acceptsOrders(session, now)`); tax stays "on top of the service charge" as is.
**Still open (do not build without asking):** whether staff may remove SINGLE items from a placed order (cancelling the whole order is decided); takeout/delivery session model; loyalty rules; assumptions in the 4b entry (a visit does not reopen after "ready to pay", one live visit per table, 12 h cookie); canonical QR address when custom domains arrive.
**Running the project (Windows, PowerShell):** Docker Desktop must be running (if the engine hangs: quit it, `wsl --shutdown`, relaunch). `npx supabase start`; `npx supabase db reset` (fresh seed: 2 demo restaurants, staff, menus, tables); `npm run dev` (http://demo-dinein.localhost:3000 = Demo Grill, dine-in; http://demo-takeout.localhost:3000 = Demo Coffee, takeout only).
`.env.local` (git-ignored) must hold `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_ROOT_DOMAIN=localhost`, `SUPABASE_SERVICE_ROLE_KEY` (all from `npx supabase status -o env`). Demo logins: `supabase/seed.sql` (owner@demo-dinein.test, waiter@..., cashier@..., owner@demo-takeout.test).
**Checks:** `npm run typecheck`, `npm run lint`, `npm test` (350 unit), `npm run test:integration` (31; files run one at a time), `npx supabase test db` (280 pgTAP), `npm run test:e2e` (129 browser tests, builds its own production server). CI runs typecheck, lint, unit tests and a production build on every push.
**Pitfalls that cost time (details in the gotchas below):** never edit repo text files with PowerShell Get-Content/Set-Content (corrupts Arabic/dashes); long `node -e` / heredoc commands break the Bash tool (write a script file and run it, and use FUNCTION replacers, never replacement strings, in `String.replace`); `npm run build` breaks a running dev server (restart it); `next build` and the `.next` cache can leave stale type files (delete `.next/types` if `tsc` complains about a file that no longer exists); the built-in browser pane is flaky for screenshots, prefer `get_page_text`/JS or Playwright; E2E leaves soft-deleted tables and sessions behind, and since 4c also real orders on Demo Grill (`db reset` clears them); NEVER run typecheck / lint / vitest or edit source files while the full E2E run is going (the dev server slows down or restarts and sign-ins time out: 11 false failures on 2026-10-10). More from 2026-10-11: before starting `npm run dev` check that port 3000 is free (`Get-NetTCPConnection -LocalPort 3000`): a dev server whose task was stopped can still be alive, a second one then lands on port 3001 and both write the same `.next` (every page 500; cure: kill both, delete `.next`, start one). Only ONE Claude session may work in this repo at a time (a second one restarted the dev server mid-run on 2026-10-10). Scripts that edit files: write them with the Write tool and run them; heredocs in the Bash tool mangle backslashes and `$`.

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
  price 0 allowed; both names required; only empty categories can be deleted. All staff read the menu; OWNER/MANAGER edit it; WAITER may only toggle sold out
  (`menu:sold-out`, DB function `set_menu_item_sold_out`).
- Gotcha: CI uses npm 11 (installed in the workflow). Node 22's bundled npm 10 rejects lock files written by npm 11
  (CI failed on 76f788e..cb45e37 for this reason). Use npm 11 locally too.
- Gotcha: Supabase Storage blocks direct SQL DELETE on storage.objects (trigger); DB tests set
  `storage.allow_delete_query = 'true'` like the Storage API does.
- Gotcha: integration tests run against the same local DB you look at — they must leave demo data as they found it.
- Gotcha: long bash heredocs with curly quotes (“ ” « ») break the Bash tool; write such scripts to a file first.
- Auth: `getClaims()` verifies JWTs locally; tradeoff: a session ended elsewhere stays valid until token expiry (max 1h).
- Gotcha (Windows setup, 2026-10-10): Docker Desktop needs the Windows "Virtual Machine Platform" feature (admin
  PowerShell, then reboot) and WSL 2. If the engine hangs on "Starting the Docker Engine...", quit all Docker processes,
  run `wsl --shutdown`, relaunch Docker Desktop. Then `npx supabase start`, copy the keys from `npx supabase status -o env`
  into `.env.local`, `npx supabase db reset`, `npm run dev`. `*.localhost` hostnames resolve in browsers but not in
  PowerShell's `Invoke-WebRequest` (test with `http://localhost:3000` there).
- Gotcha (language switch bug, fixed 2026-10-10): `loading.tsx` gets no `params`, so it cannot call `initLocale`. Calling
  `getTranslations` there made next-intl resolve and cache the DEFAULT locale (Arabic) for the whole request: `<html lang dir>`
  flipped but every string stayed Arabic on /en pages. Rule: server `getTranslations` / `getMessages` only after `initLocale`;
  in `loading.tsx` use a client component (`LoadingStatus`, text from the layout's provider). Check with
  `curl -H "Host: demo-dinein.localhost:3000" http://127.0.0.1:3000/en/staff/login` -> `<h1>` must be English.
- Gotcha (hydration warning, fixed 2026-10-10): "A tree hydrated but some attributes of the server rendered HTML didn't match" with
  `data-new-gr-c-s-check-loaded` / `data-gr-ext-installed` on `<body>` is the Grammarly browser extension, not an app bug.
  `<body suppressHydrationWarning>` in `app/[locale]/layout.tsx` silences it. Any OTHER attribute or text mismatch IS a real bug.
- Gotcha (file encoding, 2026-10-10): NEVER edit repo text files with PowerShell `Get-Content` / `Set-Content` (Windows PowerShell 5.1 reads UTF-8 as ANSI and writes garbage into Arabic text, dashes, arrows and emoji; it once corrupted README.md and this file). Use the editor tool or node (`fs`, utf8). Check with `grep -c "â€" <file>` (must be 0).
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

- Phase 3 step 6: add / edit item form — `/<locale>/staff/menu/items/new?category=…` and `/items/<id>/edit` (OWNER/MANAGER
  only). Price typed in JD -> fils via `parsePriceInput` (`src/interface/web/price-input.ts`, integer math, accepts ٤٫٥),
  bilingual field pairs (Arabic inputs dir=rtl), translated per-field errors mapped from domain errors, values kept on error.
  Adapter returns null for non-UUID ids (was a 500). README.md added and updated every iteration (CLAUDE.md rule).
    Look at: http://demo-dinein.localhost:3000/ar/staff/menu -> "إضافة صنف" / "تعديل" (sign in as owner).

- Phase 3 step 7: categories — add (`/staff/menu/categories/new`), rename + delete (`/categories/<id>/edit`), hide/show on
  the menu screen; delete item from its edit page. Rule (decided 2026-10-06): only EMPTY categories can be deleted
  (`CATEGORY_NOT_EMPTY`). Deletes ask "are you sure?" (`ConfirmSubmit`). Use cases: edit / set hidden / delete category.

- Phase 3 step 8: item photos. Domain `src/domain/menu/photo.ts` (type from magic bytes, max 5 MB, path
  `<restaurantId>/<itemId>/<uuid>.<ext>`), `menu_items.image_path` (+ check it stays in its folder), public bucket
  `menu-images` (size/type limits) with storage RLS: only that restaurant's OWNER/MANAGER write to its folder. pgTAP
  `menu_photos.test.sql` (9). `PhotoStorage` port + `SupabasePhotoStorage`; set/remove photo use cases (upload new ->
  update item -> delete old; cleans up on failure). UI: photo section on the edit-item page, thumbnails on the menu.
  Server Action body limit raised to 6 MB (`next.config.ts`).

- Phase 3 step 9: reusable option groups (decided 2026-10-06). Domain `src/domain/menu/options.ts` (groups with
  min/max picks, options with extra price in fils, `validateSelection`, `priceWithOptions`, `isGroupOrderable`).
  DB: `option_groups`, `options`, `menu_item_option_groups` with composite tenant FKs on both sides, RLS, column
  grants; pgTAP `options_isolation.test.sql` (13); demo Size/Extras/Milk in seed. `OptionsRepository` + adapter
  (setItemGroups adds before it removes, so a failed change never strips an item's groups). Use cases in
  `use-cases/menu/options/`. UI: `/staff/menu/options` (list, new, edit group + options), item edit page checkboxes,
  group labels on the menu screen. Deleting a group detaches it from items (items unchanged).
    Look at: http://demo-dinein.localhost:3000/ar/staff/menu -> "مجموعات الخيارات".

- Performance (2026-10-06): measured with `DEBUG_SUPABASE=1` (logs every Supabase call). Removed 3 auth round trips
  per action (`getUser` -> `getClaims`, local ES256 verification; forged / edited / alg:none tokens rejected in
  integration tests), parallel menu reads, optimistic toggles (`OptimisticToggle`), staff `loading.tsx` skeleton.
  Production build: toggle feedback ~8 ms, save ~100-140 ms, open edit page ~90 ms (dev server is slower).
- Phase 3 step 10: reordering — `moveInOrder` (domain/shared/ordering.ts), move category / item / option use cases,
  ↑/↓ `MoveButtons` on the menu screen and the option group page.

- Phase 4 step 1 (domain, 2026-10-10): `src/domain/order/order.ts` — `Order`/`OrderItem` with price + option snapshots,
  status flow `NEW -> CONFIRMED -> PREPARING -> READY -> SERVED -> COMPLETED` (`moveOrderTo`, one step, no skip/back),
  `createOrder` (checks orderable items, same restaurant, quantity 1..99, <=50 lines, option picks via `validateSelection`),
  `calculateTotals` (service on subtotal, tax on subtotal+service, round half up per charge, BigInt so no float drift),
  rates stored on the order, `shouldNotifyCustomer` (READY only). Adding items after confirm = a new order in the same
  session starting at NEW. 22 unit tests. typecheck + lint clean. No DB, no UI yet.
  Review fixes (2026-10-10, /code-review high, 7 findings, all fixed): rates validated (`INVALID_RATES`, no BigInt throw),
  duplicate option groups counted once, snapshot test now mutates the source objects (names are copied into the order),
  `isGroupOrderable` reused (`ITEM_NOT_ORDERABLE`), one-pass option check, own `OrderDeps` type, `ORDER_TOO_LARGE` cap
  (`MAX_PRICE_FILS`). Now 27 tests; typecheck + lint clean.
  Assumptions to confirm: tax is charged on subtotal + service charge; `CANCELLED` is NOT modelled (needs Nour's rules);
  `TableSessionId` is only an opaque id for now (table-session context comes later); takeout has no session yet (open question).

- Review fixes for the settings screen (2026-10-10, /code-review high, 6 findings: 5 fixed, 1 process note): integration test no
  longer changes demo data (the pgTAP suite proves writes in rolled-back transactions); one shared `StaffActor` +
  `requirePermission` in `application/use-cases/permissions.ts` (menu + settings use it); `Common.save/saving/cancel` keys;
  form logic moved to `settings-form-model.ts` (7 tests) + `role.test.ts`; tax hint no longer hard-codes 16%.
- Phase 4 step 2 (DB only, 2026-10-10): migration `20261010120000_orders.sql` — `order_status` enum (no CANCELLED: rules
  undecided), `orders` (totals + rates snapshot in fils, `total = subtotal + service + tax` check, `unique (restaurant_id, number)`),
  `order_items` + `order_item_options` (name/price snapshots, composite tenant FKs to menu items / options, line total >= unit x qty),
  `order_counters` + `next_order_number(restaurant)` (service_role only; row-locked counter, rolls back with a failed order),
  trigger `orders_enforce_status_flow` (one step forward only, applies to every role incl. service_role; sets `status_changed_at`).
  RLS: all staff read; OWNER/MANAGER/WAITER may update, and ONLY the `status` column (column grant); nobody inserts/deletes as
  `authenticated` (customer ordering will insert through a SECURITY DEFINER function, step 4c); anon has nothing.
  `session_id` has NO foreign key yet (table_sessions does not exist) — the table-session step must add it with a tenant check.
  Cashier cannot move orders yet (decide with the payment / table-session step). pgTAP `orders_isolation.test.sql` (34 tests).
  `npx supabase test db` -> Tests=133 (7 files), all pass.
- SECURITY finding (2026-10-10, found by the existing pgTAP test "staff cannot hard-delete"): with the current Supabase images,
  default privileges give anon/authenticated ALL on every new table in `public` (DELETE, TRUNCATE, all columns); the older
  migrations only revoked from `anon`, so `authenticated` held more than intended (RLS still blocked cross-restaurant access, but the
  column-level and no-DELETE protections were not in force). Fixed by `20261010120100_pin_table_privileges.sql` (revoke + re-grant
  exactly the intended privileges on the 8 older tables, and `alter default privileges ... revoke` for future tables and functions). Also made UPDATE column-level on `restaurants` (name only: an owner can no longer change the slug = subdomain that QR codes point at, or the id), `restaurant_settings` (the 7 setting columns) and `restaurant_members` (role only). Regression test: `table_privileges.test.sql` (37 tests) pins every anon / authenticated privilege.
  `data-model` skill section 11 corrected. Hosted Supabase should be checked the same way before going live (phase 8 hardening).
- Cashier completes orders (decided by Nour 2026-10-10): migration `20261010130000_cashier_completes_orders.sql` replaces the update
  policy: OWNER/MANAGER any next step, WAITER up to SERVED (not COMPLETED), CASHIER only COMPLETED (so only a SERVED order, the
  status-flow trigger still allows one step). Domain `permissionToMoveTo(status)`: COMPLETED -> `payments:close`, earlier steps ->
  `orders:confirm`. Recording the payment itself still belongs to the table-session / payment step.
- Phase 4 step 3 (orders: app layer, 2026-10-10): migration `20261010140000_place_order.sql` (`place_order(jsonb)`, service_role only,
  atomic: order + lines + options in one transaction; `position` columns keep receipt order). Ports `OrderRepository` +
  `OrderingCatalog`; use cases in `use-cases/orders/`: `placeOrder` (live menu -> domain `createOrder`; a bad cart is dry-run
  refused BEFORE it uses an order number), `moveOrderStatus` (permission by target status, one step, optimistic `from` check ->
  `CONFLICT`), `getStaffOrders` (open queue or one session). Adapters `SupabaseOrderRepository` (staff client for reads/status,
  service client for number + place) and `SupabaseOrderingCatalog`. New server-only env var `SUPABASE_SERVICE_ROLE_KEY` (see
  `.env.example`; `createServiceClient()` in `client.ts`; NEVER NEXT_PUBLIC_). Exposed as `orders.place / moveStatus / getForStaff`
  in `container.ts`. NO screens yet and nothing calls `orders.place` yet (customer ordering is the next step).
  Tests: 14 use-case tests, 6 mapper tests, integration `orders.integration.test.ts` (real adapters: place from the live Grill menu,
  waiter NEW->SERVED, DB refuses waiter COMPLETED, cashier completes, Coffee owner cannot see/move it; cleans up after itself),
  pgTAP `place_order.test.sql` (12). `npx supabase test db` -> Tests=149.
  Order numbers can have gaps when `place` fails after `nextNumber` (accepted; numbers need not be gap-free).
- Demo Coffee (demo-takeout) checked the same way as Demo Grill on 2026-10-10: login, language switch (all text changes), settings
  screen (takeout only, 16% / 0%), "at least one order type" rule, a real save (service 5% -> restored to 0%); Grill untouched.
  Coffee has its own menu (2 categories, 3 items, 1 option group). Neither demo restaurant has orders yet (no way to place one until 4c).

- Phase 3 step 11: restaurant settings screen (owner only, 2026-10-10). `SettingsRepository` port + `SupabaseSettingsRepository`
  (update asks for the row back: RLS turns "not allowed" into 0 rows, which counts as failure), use cases
  `use-cases/settings/` (get / update; both need `restaurant:settings`; update runs `validateSettings`), `settings` in
  `container.ts`. UI: `/<locale>/staff/settings` (order types dine-in/takeout/delivery, tax %, service charge %, default
  language) + a card on the staff home shown only to the OWNER (others get 404 on the URL). Percent typed by the owner ->
  basis points via `parseRateInput` (`src/interface/web/rate-input.ts`, integer math, accepts ١٠٫٥ and "10,5", max 2 decimals).
  No migration (table, RLS "owner updates settings" and grants already existed). Tests: use cases (7), rate input (7),
  row mapping (2), integration against local DB (2: owner saves + restores, waiter/other restaurant refused).
  Verified in the browser as owner in /en and /ar: bad rate -> field error; 12.5% saved ("Settings saved", DB = 1250 bp),
  restored to 10%; the other restaurant untouched.
    Look at: http://demo-dinein.localhost:3000/en/staff/settings (sign in as owner@demo-dinein.test).
  Not done on purpose: `restaurants.name` (restaurant name) is NOT editable here — it belongs with branding / "written details".

- Phase 3 step 12: branding (2026-10-10, direction from Nour: logo, colours, written details; "do what is best"). Domain
  `domain/restaurant/branding.ts`: ONE accent colour from a fixed palette of 8 (`ACCENT_COLORS`; a unit test COMPUTES that each has
  >= 4.5:1 contrast with white text), bilingual tagline (80) / about (500) / address (200) / opening hours (300), phone (5-15 digits),
  restaurant name EN/AR; logo JPG/PNG/WebP up to 2 MB decided by the file's bytes (SVG refused: can carry scripts); `brandingFromJson`
  never throws. DB migration `20261010160000_branding.sql`: constraints on `restaurant_settings.branding` (object, <= 8000 bytes,
  logo inside the restaurant's own folder), public bucket `restaurant-logos` (2 MB, OWNER-only writes), atomic
  `update_restaurant_branding()` (SECURITY INVOKER, name + branding in one transaction, only the OWNER), and `get_public_restaurant`
  now also returns `branding` (all of it is public by design; its pgTAP test pins the column list). App: `BrandingRepository`,
  use cases `use-cases/branding/` (get / update / set logo / remove logo; new file uploaded first, old one removed last, no orphan
  on failure), `SupabasePhotoStorage` now takes a bucket name (menu photos or logos), `PublicRestaurant.branding`. UI:
  `/<locale>/staff/branding` (owner only; logo uploader reuses `PhotoUploader` with `namespace="Logo"`) + dashboard card; the PUBLIC
  page `/<locale>` now shows the accent-coloured header with logo, both names, tagline, about, address, phone, hours.
  Shared `interface/web/digits.ts` (Arabic digits) now used by the price, rate and phone parsers. Restaurant name is edited here.
  Tests: 43 domain, 10 use-case, 6 form-model, 3 mapper, integration (real adapter + real logo bucket, never changes demo values),
  pgTAP `branding.test.sql` (17). Verified in the browser on Demo Grill (teal, logo uploaded + removed, /en and /ar) and Demo Coffee
  (orange, no logo); both restored to `{}` afterwards.
    Look at: http://demo-dinein.localhost:3000/en/staff/branding (owner) and http://demo-dinein.localhost:3000/en (public page).
  Review (high, 7 findings): fixed focus ring on the colour swatches, the order-number comment, a self-healing orders integration
  test (fixed session id + sweep), `publicDetails()` view model + tests. Skipped on purpose, for a later cleanup: (a) `domain/restaurant`
  imports `validateName` / image detection from `domain/menu` (move to `domain/shared`); (b) branding/logo saves overwrite the whole
  record (lost update if the owner saves from two devices at once: add a version column); (c) no `server-only` guard on the
  service-role client (package not installed; the key is not NEXT_PUBLIC_ so it is undefined in the browser).
  Left for later: only ONE logo (no favicon / cover image), colours are a fixed palette on purpose (owner may ask for a custom colour:
  that needs a contrast check), the accent is used on the public page header only (staff screens are not themed).

- Phase 3 step 13: Playwright E2E (2026-10-10). `@playwright/test` as a devDependency, uses the machine's Chrome (no browser download), `playwright.config.ts`, specs in `e2e/`: public page + language switch (the old text-vs-direction bug), staff login / logout / wrong password / cross-restaurant login, roles (owner / waiter / cashier dashboards, owner pages 404), menu (sold-out toggle and back, waiter / cashier limits), settings (bad rate, at least one order type, real save + restore, Arabic digits), branding (bad phone, save -> public page + colour + tel: link -> restore, logo upload / remove, SVG refused). Texts come from messages/*.json via `t()`, so they follow the translations. 66 tests, ~9 min against `npm run dev` (first compile of each page dominates), all green; demo data verified unchanged afterwards. One worker (shared DB). Gotcha: never run them against a database someone is editing by hand.
  Maintenance rule (Nour): after each new screen, re-run them and update/add specs; re-check them after customer ordering.

- Phase 4 step 4a: public menu + cart (2026-10-10; Nour chose menu and cart before table sessions). DB `20261010170000_public_menu.sql`: `get_public_menu(slug)` (SECURITY DEFINER, anon-callable, ONE jsonb document: visible categories + items, sold-out marked, option groups with live options; no ids of the restaurant, no deleted_at; the exact keys are pinned in pgTAP `public_menu.test.sql`, 14 tests). App: port `PublicMenuRepository`, use case `getPublicMenu` (re-checks visibility with the domain, drops empty categories, marks each item `orderable`: not sold out AND every required option group still has enough live options), adapter `SupabasePublicMenuRepository` (defensive JSON -> domain mapper). Domain `domain/cart/cart.ts`: a cart is ids + quantities ONLY (prices always from the live menu), identical item + option set merges, limits (99 per line, 50 lines), `parseCart` never throws (localStorage can hold anything), `priceCart` previews with the SAME money functions as a real order (a test builds the real order from the same cart and compares every total and line to the fils). UI: public `/<locale>/menu` (no login): categories, items with photo/description/price, Add (items with option groups open a native <dialog> picker: required choices block Add, price on the button follows the choices, quantity), cart bar + cart dialog (quantity +/-, 0 removes, price preview with service/tax rows, lines that became unavailable are flagged and must be removed), cart kept in this browser per restaurant (`smartmenu:cart:<slug>`, survives reload and language switch). "Place order" is shown but DISABLED with the reason: placing needs the table session (next step). Home page got a "View menu" button. Verified in production build (`npm start`): each host serves its own menu, unknown host 404.
  Tests: 5 use case, 3 mapper, 11 cart domain, integration (anonymous client against the real DB), pgTAP 14, E2E `customer-menu.spec.ts` (23: both restaurants x /en /ar: public list, sold-out, add, required/optional choices, hand-computed totals e.g. Kebab Large + Garlic x2 = 17.226 JD, quantities, persistence, per-restaurant cart, corrupted storage). Totals in the E2E data are computed BY HAND from the seed, not with the app formulas.
    Look at: http://demo-dinein.localhost:3000/en/menu and http://demo-takeout.localhost:3000/ar/menu (no login).
  Not in this step: placing the order (needs table sessions + QR), takeout flow, item search/filters, nutrition/allergen info, per-item notes.

- Phase 4 step 4b: tables, QR codes and table sessions (2026-10-10). QR design approved by Nour: the code carries a RANDOM token, never the table number.
  Domain `domain/table-session/table-session.ts` (`TableSessionId` moved here, `order.ts` re-exports it): `Table` (label <= 20 chars, tidy, no control chars or markup; token 22-64 URL-safe chars = >= 128 bits; active flag; soft delete),
  create / rename / switch on-off / regenerate token / delete; sessions OPEN -> PAYMENT_REQUESTED -> CLOSED (or OPEN -> CLOSED by hand), `acceptsOrders` only while OPEN, `permissionToMoveSessionTo`.
  DB `20261010180000_tables_and_sessions.sql`: `restaurant_tables` (unique label per restaurant ignoring case/spacing, unique token across ALL restaurants, soft delete frees the label), `table_sessions`
  (ONE live session per table by a partial unique index, status-flow trigger for every role, `ended_at` set by the trigger), the FK `orders.session_id -> table_sessions` (the one that was missing) and a trigger so orders can only be inserted into an OPEN
  session of their own restaurant. RLS: staff read; OWNER/MANAGER add/change tables (column grants: never id or restaurant_id; no delete); sessions: waiter -> PAYMENT_REQUESTED, cashier -> CLOSED, owner/manager both; nobody inserts sessions as `authenticated`.
  Public functions (SECURITY DEFINER, anon): `join_table_session(slug, token)` (returns {session_id, table_label, status} or NULL for unknown/foreign token, inactive or deleted table, dine-in off; creates the live session if none, race-safe) and `get_public_session(slug, id)`.
  Seed: demo tables with FIXED local tokens (Grill: 1, 2, Terrace; Coffee: A, whose restaurant has dine-in off so its code is "not active" on purpose). pgTAP `tables_and_sessions.test.sql` (46) + `table_privileges` extended + the orders/place_order fixtures now use real sessions. `npx supabase test db` -> Tests=230.
  App: ports `TableRepository`, `TableSessionGateway`, `TokenGenerator`; use cases `use-cases/tables/` (list / add / rename / set active / regenerate token / delete need `tables:manage`; `joinTableSession` refuses implausible tokens WITHOUT touching the DB); adapters; `newTableToken()` uses Web Crypto (NOT node:crypto: it is reachable from the middleware through the composition root).
  UI: `/<locale>/staff/tables` (add, rename in place, switch off/on, NEW QR code with "are you sure?", delete, scan link shown, warning when dine-in is off in Settings), `/<locale>/staff/tables/print` (A4 cards, ONE or ALL active tables, restaurant name + logo + "Table 7 / طاولة 7" + QR + "Scan to order / امسح للطلب" in BOTH languages), dashboard card for OWNER/MANAGER.
  QR drawn as plain SVG paths (no HTML injected) and a unit test decodes the rendered pixels with an independent reader (jsqr, dev dependency) back to the exact link.
  Scan flow, all SERVER-side (first version used client JS and was flaky): printed link `<restaurant address>/t/<token>` (no language) -> `/t/[token]` redirects to the restaurant's DEFAULT language -> `/[locale]/t/[token]` (route handler) joins the session, sets the cookie `smartmenu_table_session`
  (host-only, HttpOnly, SameSite=Lax, 12 h, Secure on https; value = session id only) and redirects to `/[locale]/menu`; invalid codes -> `/[locale]/scan-invalid` (same page for every reason, reveals nothing). The menu page reads the cookie, asks the database for the session and shows a "Table 7" banner
  (a CLOSED session shows no table). 4c will read the session from this cookie on the server instead of trusting the browser.
  Tests: 14 domain, 13 use-case, 5 qr + 1 decode, 4 mappers, 3 form-model, integration `tables.integration.test.ts` (4; sweeps its own `IT-T-` tables and the scanned seeded table's session), E2E `tables.spec.ts` (24). Full suite re-run after this step: 113 tests pass (18 min).
    Look at: http://demo-dinein.localhost:3000/en/staff/tables (owner), .../staff/tables/print, and scan http://demo-dinein.localhost:3000/t/grill-table-2-demo-token-0002 (no login).
  Review (high, 5 findings): fixed the domain/DB mismatch on C1 control characters in labels. TO DECIDE (skipped on purpose): (a) DONE 2026-10-10 (Nour: 2 hours): sessions never expired by themselves; now they close 2 hours after they start (see "Session expiry" below); (b) the QR link uses the request host: derive it from the restaurant's canonical subdomain / custom domain in the custom-domain step; (c) E2E leaves soft-deleted tables and sessions (db reset clears them); (d) route handler and cookie options are covered by browser tests only.
  Session expiry (Nour, 2026-10-10: "a table session stays open for 2 hours before it closes automatically"; read as 2 hours from the START of the visit): migration `20261010190000_session_expiry.sql`: `session_ttl()` = 2 hours; enforced LAZILY (no scheduled job):
  `join_table_session` closes a stale live session (OPEN or PAYMENT_REQUESTED) and starts a fresh one; `get_public_session` reports a stale session as CLOSED even before anyone closed it; the orders insert trigger refuses a stale session. Domain mirror: `SESSION_MAX_AGE_HOURS`, `isSessionExpired(startedAt, now)`, `acceptsOrders(session, now)` (OPEN and not expired).
  pgTAP `session_expiry.test.sql` (12). NOTE for 4c: a long dinner longer than 2 hours is cut off by design; if that hurts in the pilot, switch to an inactivity rule (last order / last activity) instead of the start time: one place to change (`session_ttl()` use sites + the domain function).
  `vitest.config.ts` now has `testTimeout: 20000` (integration tests sign in several users; the 5 s default flaked right after a database reset).
  ASSUMPTIONS to confirm with the founders: (1) once "ready to pay" is signalled the session does not reopen and takes no new orders; (2) a table has one live session at a time; (3) the 12-hour cookie lifetime.
  Cleanup note: E2E soft-deletes the tables it creates (rows stay, invisible) and leaves their sessions; `npx supabase db reset` restores the seed exactly.
  Not in this step: placing the order (4c), waiter/cashier screens that MOVE sessions (Phase 5; the database rules are ready), session timeout, takeout.

- Phase 4 step 4c, part 1 of 3: the server action (2026-10-10, interface layer only, no screen change).
  `interface/web/customer/place-order-model.ts`: `placeCustomerOrder(deps, {restaurant, sessionId, cart})` (pure, ports injected) -> `{ok, orderNumber}` or `{ok: false, problem}` with
  `problem` = `noTable | sessionEnded | paymentRequested | orderingOff | empty | tooLarge | itemsChanged | failed` (the UI will translate `Menu.order.errors.<problem>`; keys NOT added yet).
  `readCartLines` is STRICT (one odd line refuses the whole cart; ids must be UUIDs), `orderProblem` maps the use-case errors. `order-actions.ts`: `placeOrderAction(cart)` wires host + cookie + container.
  Deviations from the handoff plan: (1) `acceptsOrders(session, now)` is not called: `PublicSession` has no `startedAt`, and `get_public_session` already reports an expired visit as CLOSED, so status OPEN is the check (the insert trigger re-checks);
  (2) added `orderingOff` when dine-in is switched off in Settings; (3) if `orders.place` throws, the session is looked up again so a visit that ended in between gets the right message instead of the generic one.
  Tests: `place-order-model.test.ts` (10). `npm test` -> 287.
- Phase 4 step 4c, part 2 of 3: the cart places the order (2026-10-10, UI only).
  `cart-panel.tsx`: "Place order" is enabled when the guest has a table (banner) AND `priced.canCheckout`; otherwise it stays off with the reason (`Menu.cart.checkoutSoon` = no table, new `Menu.cart.fixFirst` = a flagged line must be removed).
  Pending label `Menu.cart.placing`; a refusal shows `Menu.order.errors.<problem>` (8 keys, both languages) in a red alert and KEEPS the cart; success clears the cart and the same dialog shows the confirmation (`Menu.order.title / numberLabel / body / done`, number in `<bdi>`).
  `customer-menu.tsx`: calls `placeOrderAction({ lines: cart.lines })`; a thrown call (no connection) = `failed`; after any refusal `router.refresh()` so the menu / table banner show the current state.
  Checked in the browser: Grill /ar (scan table 2 -> Hummus -> order number 1; DB row NEW, 1250 / 125 / 220 / 1595 fils, same as the cart), Grill /en with the visit set to PAYMENT_REQUESTED (bill message, cart kept), a stale cart line (button off + "remove" note), Coffee /en (no table: button off + scan note).
  The test order, its session and the order counter were deleted afterwards (database as seeded). `e2e/customer-menu.spec.ts` re-run: 23 pass (the no-table case it checks is unchanged).
  Known gap (accepted for now, raise in review): if the reply is lost after the server stored the order, the guest sees "could not send" and a retry makes a second order (fix = an idempotency key per cart submission).
  Wording gap: on a takeout-only restaurant the note still says "scan the QR code on your table" (takeout flow is the open question).
- Phase 4 step 4c, part 3 of 3: tests, review, commit (2026-10-10).
  Integration `src/infrastructure/customer-order.integration.test.ts` (2): scan -> public menu -> cart preview (hand-computed 17.226 JD) -> `placeCustomerOrder` -> the signed-in waiter reads a NEW order with the same totals and lines; Coffee refused (`orderingOff`), a Grill session on Coffee = `noTable`, PAYMENT_REQUESTED and CLOSED refused with nothing stored, a fresh scan orders again. Own fixed table id, swept before and after, counter put back.
  `npm run test:integration` now has `--no-file-parallelism`: two files use Demo Grill's order counter and the older one asserts the exact next number.
  E2E `e2e/place-order.spec.ts` (5): Grill /en + /ar (own table, scan, order -> number, cart empty after reload, banner stays, second order = number + 1), Coffee /en + /ar (code not active, button off + note), a stale line switches the button off until removed, and the cart is frozen while the reply is held back. Shared steps moved to `e2e/support/tables.ts` and `e2e/support/cart.ts`.
  Review (high, 10 findings): FIXED 6: cart cannot be closed or edited while sending (was: confirmation lost / edits discarded), refusal message clears when the cart changes, unexpected use-case refusals are logged, quantity must be a whole number >= 1 (was reported as "too large"), E2E cart helpers shared. SKIPPED 4: see "Left open by the 4c review" in START HERE.
  Full E2E run: 107 passed, 11 failed in 37 min (normally ~18): sign-ins stuck on "Signing in..." past 20 s while other checks and edits ran alongside (my mistake, see pitfalls). Clean re-run of the 6 affected specs: 88 passed, 2 failed, both in place-order.spec at the moment the dev server refused connections (it restarted mid-run). place-order.spec alone afterwards: 4 runs, 3 fully green, 1 with "grill /en" failing on an element not found (1.4 min, not reproduced, cause NOT found).
  So: every spec has passed, but there has been NO single fully green 118-test run since 4c. Do one at the start of the next session (after `npx supabase db reset`, nothing else running) and investigate the place-order "grill" test if it fails again.
  Demo data after the runs: settings, tables and sold-out flags as seeded; Demo Grill has test orders (no screen deletes them): `npx supabase db reset` clears them.

- Test run findings (2026-10-11, after 4c; no app code changed).
  Dev-server runs were unreliable (107/118, then 109/118 with nothing else running: sign-ins stuck > 20 s). A first "production" run was invalid: another Claude session restarted `npm run dev` on port 3000 seconds after it was stopped, `npm start` failed with EADDRINUSE, and the tests ran against a dev server whose `.next` had just been rebuilt (50 false failures).
  Valid production runs: 110/118, then 113/118 after one test-helper fix. Fixed: `e2e/support/tables.ts` `removeTable` counted rows before the streamed list was on the page (always 0 on production), so NO test table was ever deleted there and the print-page tests saw leftovers; it now waits for the add form first.
  Fixed: pgTAP `place_order.test.sql` counted every order in the database (4 failures once real orders existed); counts are now scoped to the test's own restaurant.
  NOT fixed: the sold-out toggle on production (see START HERE). An attempt to wait for network idle in the test did not help and was reverted.
  Demo data: settings, tables, sold-out flags as seeded. Left behind by the runs: about 50 test orders and 50 table sessions on Demo Grill, and both restaurants' `branding` holds empty fields instead of `{}` (looks the same on screen; not traced to a specific run). `npx supabase db reset` restores the seed exactly (ask Nour first).
- Phase 5 readiness check (2026-10-11). READY: `orders.getForStaff` (open queue or one session) and `orders.moveStatus` (one step, permission by target status, CONFLICT on a stale status) with tests; database rules for order status and for moving table sessions by role; a real order can now be placed to test against.
  MISSING (to build, in order): (1) the table label for an order: an `Order` only has `sessionId`, and no staff-side port reads sessions/tables together; (2) use cases + adapter to MOVE a table session (waiter: PAYMENT_REQUESTED, cashier: CLOSED): only the domain rule `permissionToMoveSessionTo` and the database policy exist; (3) live updates: no table is in the `supabase_realtime` publication and there is no port for subscriptions (decide realtime vs polling, and how a browser subscribes without importing Supabase outside infrastructure); (4) notifications: `src/infrastructure/notifications/` is empty; (5) nothing lets a GUEST see their order's status (needed for the READY notice on the session's devices).
  Decisions: answered by Nour on 2026-10-11 (see START HERE). Still to ask when cancelling is built: which roles, up to which status, and how a cancelled order shows on the bill; and whether staff may remove single items.

- Stuck page after a save on production: diagnosed and worked around (2026-10-11). How it was found, for next time: probes in a throwaway Playwright script against `npm start` (click as soon as the page settles; a stuck page shows the button pressed and no badge), then temporary `console.log`s in copies of Next's client files in `node_modules` (action queue, layout router, Flight client `then`, React `attachPingListener` / `pingSuspendedRoot`), each backed up first and restored afterwards (checked: no trace left).
  Ruled out on the way: a navigation discarding the action (none), a truncated reply (the page reads all 28 KB; Playwright's `ERR_ABORTED` on these requests is noise), a stylesheet React waits for, Next's own "suspend forever" markers, unresolved Flight rows (all fulfilled), `revalidatePath(path)` versus `(path, "layout")` (no difference).
  Deciding evidence: React's root kept two transition lanes suspended with nothing pinged; every thing it waited for had been woken exactly once, the last one while the same lanes were rendering with exit status 4, on a row whose status was `resolved_model` when the wake-up was attached.
  New file `stuck-render-guard.tsx` + one line in the locale layout. No test of its own: `e2e/staff-menu.spec.ts` on a production build is the test (fails 5 of 6 without the guard).

- Duplicate-order fix, part 1 of 3: database (2026-10-11, NOT committed yet). Affected layers, listed before editing: database -> application (port + use case) -> infrastructure (adapter) -> interface (server action model) -> UI (cart).
  Migration `20261011100000_order_request_key.sql`: `orders.client_request_id uuid` (nullable) + partial unique index `orders_client_request_key (restaurant_id, session_id, client_request_id) where client_request_id is not null`.
  `place_order(jsonb)` replaced (same signature and grants): reads the optional `client_request_id`; `insert ... on conflict (that index) do nothing`; when the key was already used in this session it writes NOTHING and RETURNS THE EARLIER ORDER'S ID (so the caller compares the returned id with the one it sent). Any other clash (order number, id) still raises 23505.
  pgTAP `place_order.test.sql` 12 -> 19 (key stored, same key returns the first order, no second order or lines, same key at another table is a new order, a new key does not excuse a reused number). `npx supabase test db` -> 249. Integration 27 still green (the app does not send a key yet).
  Applied locally with `npx supabase migration up` (keeps the data; no reset).
  NEXT: part 2 = application + infrastructure: `OrderRepository.place` returns the stored order's id and gets the key, `findById` for the earlier order, `placeOrder` use case takes `requestId` and returns the EXISTING order (same number) on a repeat without using a new order number; unit + integration tests.
- Duplicate-order fix, part 2 of 3: application + infrastructure (2026-10-11, NOT committed yet).
  Port `OrderRepository`: `place(order, requestId?)` now RETURNS the id of the order stored for the request (its own, or the earlier one with the same key); new `findByRequest(restaurantId, sessionId, requestId)`.
  Use case `placeOrder`: optional `requestId`. With a key it first looks for the earlier order and returns it (no menu check, no order number used: the order exists, whatever sold out since); if two copies arrive together and the store names another id, it reads that order back and returns it.
  Adapter: `toPlaceOrderPayload(order, requestId?)` sends `client_request_id` (null when none); `findByRequest` returns null for ids that are not UUIDs.
  Tests: unit 287 -> 291 (repeat = same order and number; sold out before the retry; two at once; mapper), integration 27 -> 28 (real database: retry returns the first order with no new row and no number used; two parallel calls with one key leave ONE order; a new key is a new order). typecheck + lint clean.
  Nothing sends a key yet, so guests are not protected until part 3.
  Gotcha found: stopping a background `npm run dev` from the app can leave its node processes alive on port 3000; a second `npm run dev` then lands on port 3001 and both write the same `.next` (every page 500). Check `Get-NetTCPConnection -LocalPort 3000` before starting one; cure: kill both, delete `.next`, start one.
  NEXT: part 3 = interface + UI: the cart makes one key per submission (kept across retries, new after a success or a cart change), `placeCustomerOrder` reads and validates it; E2E with a reply that is dropped on purpose; review, commit, push.

- Duplicate-order fix, part 3 of 3: server action + cart + browser test (2026-10-11). The fix is complete.
  New `interface/web/customer/request-key.ts`: `requestKeyFor(store, slug, cart.lines, now)` gives the key to send: the stored one when the cart contents are the same (compared by the domain's line keys + quantities) and it was used in the last 5 minutes (`REQUEST_KEY_MAX_AGE_MS`; every retry keeps it alive), otherwise a new one; stored in localStorage as `smartmenu:order-request:<slug>` (survives a reload); `forgetRequestKey` after a success. `newRequestKey` falls back to `crypto.getRandomValues` where `crypto.randomUUID` is missing (plain http on a LAN).
  WHY the 5-minute limit: without one, a guest whose first attempt reached the kitchen (but who never saw the confirmation) and who later orders the same things again would be shown the OLD order number while nothing new is ordered. A retry comes within minutes; a second round comes later.
  `place-order-model.ts`: `readRequestId` (a UUID, REQUIRED: a cart without a key is refused as `failed`), passed to `orders.place`. `customer-menu.tsx` sends `{ lines, requestId }`.
  Tests: unit 291 -> 298 (`request-key.test.ts` 6, model +1), integration: the guest path now retries with the same key and gets the same number, and a cart without a key is refused. E2E `place-order.spec.ts` +1 (119 tests in all): the reply is dropped ON PURPOSE after the server stored the order (`route.fetch` to 127.0.0.1 with the Host header, then `route.abort`), the guest sees "could not send", presses again and gets the number from the dropped reply; the next order gets exactly the next number.
  Review (high, 7 findings): FIXED 3 (key lifetime now counts from the LAST use; the cart fingerprint reuses the domain line key; an assertion moved out of the network handler). LEFT OPEN 4: (a) the table visit is checked BEFORE the key is looked up, so a retry is refused if the visit stopped taking orders in the seconds between (2-hour limit hit, or "ready to pay"): the order exists, the guest is told to scan again, and after a rescan the same cart is a second order in the NEW visit; fix = look the key up first (needs a small "find order by request" use case wired to the action); rare, not done. (b) a known key returns the earlier order without comparing its contents with the cart sent now (needs a client fault to matter). (c) one extra database read per order (the price of not re-checking the menu and not using a number on a retry). (d) `keyStore()` in `customer-menu.tsx` repeats the guarded localStorage access of `use-cart.ts`.
  Also fixed a flaky browser test found on the way: `staff-branding.spec.ts` read the logo's width once, before the picture had loaded; it now waits for it.
  Final browser run on a production build: 119 passed in 5 min.

- Retry-gap fix (2026-10-11; finding (a) of the duplicate-order review). `placeCustomerOrder` checked the table visit BEFORE the submission key, so a retry was refused when the visit stopped taking orders in the seconds after a lost reply (2-hour limit, or "ready to pay"); after a rescan the same cart became a second order in the NEW visit.
  Now: when the visit is not OPEN, it first asks `findPlaced({restaurantId, sessionId, requestId})` (new tiny use case `makeFindPlacedOrder` in `place-order.ts`, wired as `orders.findPlaced` in `container.ts`, service client like `place`); an earlier order answers with its number, otherwise the refusal stands. While the visit is OPEN nothing changes (the use case does that lookup itself).
  Tests: unit 298 -> 299 (model: CLOSED and PAYMENT_REQUESTED with an earlier order; use case: this key / table / restaurant only), integration: an order placed while open is answered again after PAYMENT_REQUESTED and after CLOSED, while a different key is still refused.
- Browser tests build and start their own production server (2026-10-11). `e2e/support/server.ts` (port 3100, folder `.next-e2e`, address helpers), `playwright.config.ts` (`webServer`: `next build && next start --port 3100` with `NEXT_DIST_DIR`; never reuses a server unless `E2E_REUSE_SERVER=1`; build output is shown), `next.config.ts` (`distDir` from `NEXT_DIST_DIR`), `tsconfig.json` / `.gitignore` / `eslint.config.mjs` know the folder; the three specs that named port 3000 use the helpers; CLAUDE.md command line updated.
  Proved with `npm run dev` running on port 3000 the whole time: 119 passed in 5.5 min (including the build), with the dev server running alongside; the dev server kept answering and port 3100 was free again afterwards.
  Review (high, 5 findings): FIXED 3 (build output was hidden, so a failed build would not say why; opt-in server reuse for quick repeats; one helper for the customer-side order repository). NOT fixed, documented in START HERE: `next-env.d.ts` follows whichever build ran last; the test build still type-checks `.next/types`.
- Decisions recorded in PROJECT_SPEC.md §4 and §12 (2026-10-11): READY notice on the session's phones + web notification where possible, no SMS; cancelling rules (our choice, see START HERE).

- Phase 5 step 1, part 1 of 2: which table an order belongs to, rules layer (2026-10-11, domain + application only, NOT committed yet, no screen, nothing wired).
  Domain `table-session.ts`: `effectiveSessionStatus(session, now)`: a visit past its 2 hours counts as CLOSED whatever its stored status (what the guests' phones already see); `acceptsOrders` now uses it.
  Port `application/ports/table-session-repository.ts` (STAFF side, RLS): `findWithTables(restaurantId, sessionIds)` -> `{ session, tableLabel }[]` (current label, also for a table deleted since; unknown or foreign ids are simply missing).
  Use case `orders/get-staff-order-list.ts`: `makeGetStaffOrderList({ orders, sessions, clock })(actor, { sessionId? })` -> `StaffOrderEntry[]` = `{ order, table: { sessionId, label, sessionStatus } | null }`: the open queue or one visit's orders, ONE table lookup for the whole list, effective status, a foreign restaurant's visit never used, an order with an unreadable visit still listed (table null).
  Tests: unit 299 -> 306 (2 domain, 5 use case with fakes). typecheck + lint clean.
- Phase 5 step 1, part 2 of 2: storage + wiring (2026-10-11). Step 1 is complete.
  `infrastructure/supabase/supabase-table-session-repository.ts`: `findWithTables` reads `table_sessions` with `restaurant_tables(label)` embedded (one query; deleted tables included on purpose; ids that are not UUIDs are dropped; a row without its table is skipped). Staff client, so RLS decides: an anonymous client gets "permission denied" (it has no grant on the table at all), another restaurant's staff get an empty list.
  `container.ts`: `orders.getForStaff` now runs `makeGetStaffOrderList` (orders + sessions on the same signed-in client); the old `get-staff-orders.ts` and its tests are removed.
  Tests: mapper +2; integration 28 -> 29 (`tables.integration`: waiter / cashier / owner read a scanned table's visit with its label, the label follows a rename and survives a soft delete, Coffee's owner and a wrong restaurant id get nothing, anonymous is refused; `orders.integration`: the cashier's queue shows the order WITH its table, and the completed order stays on the table's bill). Unit 306.
  Review (high, 3 findings, none fixed here): (a) FOR STEP 3: the open queue is "everything not COMPLETED", so an order nobody completed stays in it forever after its visit closed or timed out: the screen needs a rule (hide, group, or cancel orders of ended visits); (b) all session ids go in one request address (fine for one restaurant; a queue of several hundred visits would be too long, and (a) is what would cause that); (c) two round trips per list (orders, then visits + tables): acceptable, keeps table data out of the order storage.
  NEXT: step 2 = moving a table session (waiter: PAYMENT_REQUESTED, cashier: CLOSED; owner / manager both): port method `updateStatus(restaurantId, sessionId, from, to)` on `TableSessionRepository`, use case `moveTableSession` (permission from `permissionToMoveSessionTo`, `moveSessionTo` in the domain, CONFLICT when someone else moved it first, an expired visit counts as CLOSED), adapter, tests. No screen yet.

- Phase 5 step 2: moving a table session (2026-10-11; application + infrastructure, no screen, no migration: the database rules already existed).
  Port `TableSessionRepository.updateStatus(restaurantId, sessionId, from, to)` (conditional on `from`; false = someone else moved it, not there, or the database refused).
  Use case `tables/move-table-session.ts`: `makeMoveTableSession({ sessions, clock })(actor, { sessionId, to })` -> the moved `{ session, tableLabel }` or `FORBIDDEN | SESSION_NOT_FOUND | INVALID_TRANSITION | CONFLICT`. Permission from `permissionToMoveSessionTo` (PAYMENT_REQUESTED = `orders:confirm`: waiter, manager, owner; CLOSED = `payments:close`: cashier, manager, owner). A visit past its 2 hours counts as CLOSED for "ready to pay" (refused), but can still be CLOSED properly (moves from the STORED status, so the record and its end time come into line).
  Adapter: `SupabaseTableSessionRepository.updateStatus` (only `status` is sent; the trigger sets `ended_at`). The refusal codes 42501 / 23514 now live in one place, `infrastructure/supabase/postgres-errors.ts`, used by the order and the session adapters.
  Wired as `tableSessions.move` in `container.ts` (signed-in staff client).
  Tests: unit 306 -> 312 (`move-table-session.test.ts`: each role's move, lifecycle refusals, expired visit, other restaurant, conflict); integration 29 -> 30 (real database: cashier cannot signal payment and waiter cannot close, also when the use case is bypassed; Coffee's owner cannot touch a Grill visit; waiter signals, guests' lookup sees it; cashier closes, end time stamped; nothing after CLOSED; the next scan starts a new visit).
  Review (high, 3 findings): fixed 1 (refusal codes shared). OPEN, for Nour before the screen (step 3): (a) a visit can be closed, or marked ready to pay, while its orders are still unfinished; together with the step 1 finding (unfinished orders of an ended visit stay in the queue forever) this needs ONE rule. (b) the returned end time is the app's clock, the stored one is the database's (milliseconds apart; reload shows the stored one).
  NEXT: step 3 = the staff order screen (`/<locale>/staff/orders`): the open queue from `orders.getForStaff` with table labels, status buttons by role (`orders.moveStatus`), the visit's state and its "ready to pay" / "close" buttons (`tableSessions.move`), both restaurants, /ar + /en, E2E spec. Load the `arabic-rtl` skill first. Needs Nour's answer on the rule above.

- Phase 5 step 3: the staff order screen (2026-10-11; interface + UI; no backend change).
  Decided first (Nour: "go ahead as you suggested and choose what's best"; in PROJECT_SPEC §4): closing a visit is refused while it has unfinished orders; "ready to pay" stays allowed; unfinished orders of visits that are over get their own group below the live queue; two staff screens, Orders and Tables.
  `/<locale>/staff/orders` (every role; card "Orders" first on the staff dashboard): `orders.getForStaff` -> `buildOrderQueue(entries, role)` (`staff/order-queue-model.ts`, pure: per order its table label, visit badge, lines with choices, total, and `next` = the step THIS role may take, else `waitingFor` = "cashier" | "floor") -> `OrderQueueView` (`staff/order-queue.tsx`, server component). One button per order (`moveOrderAction(locale, orderId, to)` in `staff/order-queue-actions.ts`: `requireStaff` + `orders.moveStatus`, returns nothing, the list refreshes and shows the truth); `components/pending-submit.tsx` (button off + "Saving…" while the action runs).
  The ended group is a `<details>` (open when it has up to 5 orders, folded with its count when more) and its cards show day + time; live cards show the time only. New `formatTime` / `formatDayTime` in `format.ts` (Asia/Amman, 24-hour, Western digits in both languages).
  A plain "Refresh" link reloads the list: live updates and the sound are step 5.
  Messages `StaffOrders.*` + `StaffHome.ordersLink(Hint)` in both files.
  Tests: unit 312 -> 320 (queue model 6, time formats 2). E2E new `staff-orders.spec.ts` (5): Grill /en + /ar: a guest's order shows for the waiter (number, table, item, total, New) and for the cashier (no button, "with the floor staff"); the waiter steps it to Served (then no button, "the cashier completes it"); the cashier completes it and it leaves both queues; Coffee /en + /ar: the screen is there and empty; the owner takes an order through all five steps. `staff-login.spec.ts`: /staff/orders needs a login. The "place an order" steps moved to `e2e/support/cart.ts` (`placeAnOrder`, `confirmation`, `placeButton`). Full suite: 124 passed.
  Checked by hand on Grill as the waiter, /en and /ar.
  Review (high, 3 findings): fixed 2 (ended group folded when long; day shown for old orders). Open: a refused step (someone else was first) gives no message, the list just shows the real state.
  Demo data: Demo Grill's queue is full of test orders from the browser runs (about 100, half in the ended group; order 99 on table 2 is a hand test, left at Preparing). `npx supabase db reset` clears them (Nour: leave the database for now).
  NEXT: step 3b = the Tables screen (see START HERE).

- Phase 5 step 3b: the open tables screen (2026-10-11). Two commits: rules + storage, then the screen.
  Rules + storage: domain `billTotals(orders)` (a bill is the SUM of its orders as each was priced when placed; nothing is recomputed) and `isUnfinished`; ports + adapters `OrderRepository.listBySessions` and `TableSessionRepository.listLive` (stored status not CLOSED, oldest first, with table labels); use case `tables/get-open-visits.ts` -> `OpenVisit[]` = `{ session, tableLabel, status (effective), orders, bill, unfinished }` (two queries for the whole screen; a visit past its 2 hours stays listed, as CLOSED, until staff close it); `moveTableSession` now needs `orders` and REFUSES to close a visit with unfinished orders (`UNFINISHED_ORDERS { count }`); "ready to pay" is not blocked. Wired as `tableSessions.listOpen` / `tableSessions.move` (both through `staffOrderDeps()`).
  Screen `/<locale>/staff/open-tables` (every role; card "Open tables" second on the dashboard): `buildOpenTables(visits, role)` (`staff/open-tables-model.ts`: state open | paymentRequested | timedOut, `canRequestPayment`, `close` = allowed | unfinished | notYours) -> `OpenTablesView` (`staff/open-tables.tsx`): table, state, since when, its orders (number, status, total), the bill (subtotal, service, tax, total), "Ready to pay" (floor / owner / manager, only while open), "Close table" with "are you sure?" (cashier / owner / manager, only when nothing is unfinished; otherwise a note with the count and a link to Orders). `moveVisitAction` in `staff/open-tables-actions.ts`. Messages `OpenTables.*` + `StaffHome.openTablesLink(Hint)`.
  Tests: unit 320 -> 335 (domain 3, getOpenVisits 5, moveTableSession +2, screen model 5); integration 30 (same count, more checks: live list by restaurant, the open table's bill with real adapters, closing refused with an unpaid order, nothing unfinished once it is completed). E2E new `staff-open-tables.spec.ts` (5): Grill /en + /ar: a guest orders; the waiter sees the table's bill and signals "ready to pay"; the guest can no longer order ("the bill is being prepared"); the cashier cannot close yet (link to Orders, no buttons); the owner completes the order; the cashier closes the table and it leaves both screens; the guest's table banner is gone. Coffee /en + /ar: empty. A table that was only scanned is closed straight away and the next scan starts a new visit. New `e2e/support/staff.ts` (`staffAt`, `refresh`, `orderCard`, `tableCard`, `takeOrderThrough`), used by both staff specs. `staff-login.spec.ts`: both screens need a login.
  Checked by hand on Grill as the waiter (/en): table 2 with order 99 and its bill; the button was NOT pressed (demo table left as it was).
  Review (high, 2 findings, both for later): (a) FOR STEP 4's MIGRATION: the "no unfinished orders" check and the close are two requests, and the database does not enforce the rule, so an order placed in the instant between them is left in a closed visit: add a trigger on closing; (b) the bill lists orders by number, status and total but not their items, and a completed order is on no other screen: the cashier cannot look up what an order contained (wanted with receipts).
  Gotcha: `openTables()` in `e2e/support/tables.ts` makes the OWNER's page answer yes to every "are you sure?"; a second `page.once("dialog", accept)` on that page crashes ("already handled").
  Demo data: the open tables screen on Demo Grill lists about 100 tables, most "time is up", all leftovers of browser runs (older specs leave their visits open; the new spec closes its own). `npx supabase db reset` clears them.
  NEXT: step 4 = cancelling (rules in PROJECT_SPEC §4).

- Phase 5 step 4, part A: cancelling an order: rules, database, storage (2026-10-11; no screen yet). Rules: PROJECT_SPEC §4.
  Database, two migrations (applied locally with `npx supabase migration up`, data kept): `20261011120000_order_cancelled_status.sql` only adds the enum value `CANCELLED` (a new enum value cannot be used in the transaction that adds it); `20261011120100_cancel_orders.sql`: enum `order_cancel_reason` (GUEST_CHANGED_MIND, ITEM_UNAVAILABLE, MISTAKE, OTHER); `orders.cancel_reason / cancelled_at / cancelled_by` with checks (reason and time exactly when CANCELLED); `grant update (cancel_reason)` to staff.
  `orders_enforce_status_flow()` REWRITTEN (the old one took "the next enum value" as the next step, which the new last value would have turned into COMPLETED -> CANCELLED): forward exactly one step along the six-step flow for everybody; -> CANCELLED from any step before COMPLETED, needs a reason, by OWNER / MANAGER always and by the WAITER only from NEW or CONFIRMED (42501 otherwise; the server, with no auth.uid(), is trusted); stamps `cancelled_at = now()`, `cancelled_by = auth.uid()`; nothing after COMPLETED or CANCELLED; the cancellation columns cannot be edited afterwards (the trigger now also fires on them). The update policy needed no change (waiter: any status but COMPLETED; cashier: only COMPLETED, so never CANCELLED).
  `table_sessions_enforce_flow()`: closing is refused (23514) while the session has an order that is neither COMPLETED nor CANCELLED, UNLESS the session has run out of time (the next scan must be able to close it and start a new visit). `orders_require_open_session()` now locks the session row FOR SHARE, so an order cannot slip in while its visit is being closed (whichever is first, the other sees it). This closes the race from the step 3b review.
  pgTAP new `cancel_orders.test.sql` (31): each role acting directly on the table, the stamps, finality, the unfinished-orders rule, the timed-out exception, the server. Total 280. Gotcha: in pgTAP `reset role` does NOT clear `request.jwt.claims`: set it to '' to act as nobody.
  Domain `order.ts`: `ORDER_STATUSES` = the flow + CANCELLED (`ORDER_FLOW` stays the six steps); `CANCEL_REASONS`; `Order.cancellation: { reason, at, by } | null`; `cancelOrder(order, reason, now)`; `permissionToCancel(status)` -> `orders:cancel` (NEW, CONFIRMED) | `orders:cancel-late` (PREPARING, READY, SERVED) | null; `nextStatus("CANCELLED")` is null; `isUnfinished` = neither COMPLETED nor CANCELLED; `billTotals` now takes orders WITH their status and leaves CANCELLED ones out. `role.ts`: the two new permissions (waiter: `orders:cancel`; manager and owner: both; cashier: neither).
  Application: port `OrderRepository.cancel(restaurantId, orderId, from, reason)`; use case `orders/cancel-order.ts` (`ORDER_NOT_FOUND | FORBIDDEN | INVALID_TRANSITION | INVALID_CANCEL_REASON | CONFLICT`; returns the order as STORED, with the database's stamps). Adapter: `cancel`, the cancellation columns in `toOrder`, and `listOpen` now leaves out CANCELLED too. Wired as `orders.cancel`.
  Tests: unit 335 -> 350 (domain 6, role 1, mapper 1, use case 7); integration 30 -> 31 (real roles: waiter cancels NEW with the stamps; final; cashier and Coffee's owner refused also when the use case is bypassed; waiter refused once PREPARING, owner may; cancelled orders leave the queue, stay on the bill at zero; closing refused by use case AND database over one unfinished order; closes once everything is cancelled or completed). `customer-order.integration`: its "closed visit" is now made 3 hours old first (a visit with orders in it can no longer just be closed).
  Review (high, 3 findings, none fixed): (a) the two-file enum change was proven by applying to the existing database, NOT by a full `db reset`: if a reset ever fails with "unsafe use of new value CANCELLED", the runner put both files in one transaction; (b) database and app differ on purpose for timed-out visits (see above); (c) guests are not told about a cancellation yet (step 6, with the guest-side order status).
  NEXT: step 4 part B = screens: "Cancel" on an order card (only where `permissionToCancel` gives this role the permission) with a reason picker and a confirmation; cancelled orders struck through at zero on the open tables bill; messages in both languages; E2E; then the FULL browser suite.

## In progress / verify first
- Waiting for approval of: Phase 4 steps 4a (public menu + cart), 4b (tables, QR codes, sessions) and 4c (placing the order). Dev server + local
  Supabase are running for Nour. After `npx supabase db reset` sign in again. NEW env var `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`): restart `npm run dev` after adding it.

## Phase 3 audit (2026-10-10): what is still left
- Branding, settings screen, menu, options, photos, reorder: DONE (see the log above).
- E2E tests: DONE (step 13). Phase 3 is complete.
- Deliberately NOT Phase 3: staff management and tables/QR (Phase 4/5), public customer menu read path (Phase 4).

## Next
- Phase 5: staff order screen. Steps and order: see START HERE.
- Takeout part of Phase 4 needs the takeout-session open question answered first.

## Open questions (do not build without asking) — see spec §12
- Removing SINGLE items from a placed order (cancelling a whole order: decided 2026-10-11); takeout/delivery session model; loyalty rules. (Branding elements: decided 2026-10-10, logo + accent colour + written details; see the log.)

