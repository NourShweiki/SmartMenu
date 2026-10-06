# Progress log

Read this after `PROJECT_SPEC.md` at the start of every session. Update it at the end of every iteration.

## Decisions made so far
- Hosting: Vercel + Supabase, but **localhost only for now** (Vercel setup postponed until there is real progress).
- Local database: Supabase CLI in Docker (`npx supabase start`).
- Tooling: Next.js 15 + React 19 + strict TS, Tailwind v4, Vitest, ESLint layer rules, `next-intl` (planned), pgTAP DB tests.
- Defaults: Arabic is the default language; Western digits in both languages; only OWNER changes restaurant settings.
- Tax/service-charge preset values are placeholders and adjustable later (owner setting) — not a blocker.
- Table session states (planned): `OPEN -> PAYMENT_REQUESTED -> CLOSED`.
- Working style: very small iterations, one at a time; Nour approves each. Show every visible change on http://localhost:3000.

## Done
- Phase 0: spec, CLAUDE.md, skills (`architecture-rules`, `data-model`, `arabic-rtl`).
- Phase 1 step 1: Next.js skeleton + layer folders. Step 2: GitHub Actions CI (`npm run check`). Deploy: postponed.
- Phase 2 step 1: restaurant domain — `src/domain/restaurant/` (slug, bilingual name, settings + presets, roles/permissions) with unit tests. Passing.
- Phase 2 step 2: local Supabase + migration for `restaurants`, `restaurant_settings`, `restaurant_members` with RLS; pgTAP isolation test (12 tests); seed with 2 demo restaurants.
- Fix: migration `20261006000100_grant_table_privileges.sql` (new Supabase doesn't auto-grant table privileges).
- Verified 2026-10-06: `npx supabase db reset` + `npx supabase test db` -> `Tests=12`, all pass; `npm run check` green (typecheck, lint, 19 unit tests, build).

## In progress / verify first
- Nothing pending.

## Next
- Phase 2 step 3: connect the app to the database — Supabase client in `src/infrastructure/supabase/`, `.env.example`,
  a `RestaurantRepository` port + Supabase adapter, and a first page on localhost:3000 showing the demo restaurant's name (ar/en).
- After that: auth for staff (Supabase Auth), then locale routing `/ar` `/en` with RTL.

## Open questions (do not build without asking) — see spec §12
- Removing items after order confirmation; takeout/delivery session model; loyalty rules; exact branding elements.
