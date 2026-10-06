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

## In progress / verify first
- Nothing pending.

## Next
- Staff auth (Supabase Auth): sign-in for staff, resolve restaurant + role from `restaurant_members`.
- Then locale routing `/ar` `/en` with `next-intl`, message files, Arabic font (e.g. IBM Plex Sans Arabic).
- Later: custom domains (needs a DB lookup in tenant resolution); set `APP_ROOT_DOMAIN` on Vercel when deploying.

## Open questions (do not build without asking) — see spec §12
- Removing items after order confirmation; takeout/delivery session model; loyalty rules; exact branding elements.
