# SmartMenu — instructions for Claude Code

Read `PROJECT_SPEC.md` at the start of every session. It is the source of truth.
Then read `docs/PROGRESS.md` to see where work stopped (its **START HERE** section at the top says what is done, what the next task is, how to run everything, and the pitfalls), and update it at the end of every iteration.

## Where the project is (update this block in every iteration)
- **Phase 6, onboarding tools.** Done: step 1 (the team's setup tool: create a restaurant, owner's temporary password, change / replace / reissue passwords) and step 2 (staff accounts managed by the owner and manager: `/staff/team`).
- **Now: step 3, takeout ordering** (design: PROJECT_SPEC.md §4 "Takeout design"). Parts A (domain rules and database: a pickup visit = a session WITHOUT a table, with the customer's name and mobile number) and B (use cases and adapters: `orders.placePickup`, session and order reads that know both kinds of visit, the cashier's steps on a pickup order) are done. Next is part C (the customer screen: name + mobile in the cart, order without a table, "your orders" for the pickup visit), then part D (staff screens: "Takeout" with name and number in the queue). No screen offers takeout yet.
- After that: setup checklist, menu import (spreadsheet, then AI). **Custom domains are postponed to Phase 7 (Nour, 2026-10-12).**
- **Standing instruction for the rest of Phase 6 (Nour, 2026-10-12):** work through the remaining steps part after part WITHOUT waiting for approval between them; after EACH part update the md files, commit and push; keep using mock menu items and prices (no real restaurant yet); when the whole phase is finished, write Nour a summary of everything done and every change, step by step. Still stop and ask for: anything destructive, anything under "Open Questions", and the AI menu import's key and cost.
- Last verified counts: 438 unit, 42 integration, 417 database (pgTAP), 150 browser tests.

## Skills — load before the matching work
- `architecture-rules` — before creating/editing any code file or deciding where code goes
- `data-model` — before entities, migrations, RLS, repositories, or money math
- `arabic-rtl` — before any UI, strings, or price/date formatting
- Run `/code-review` at the end of each iteration.

## Iteration rules (non-negotiable)
- One iteration = one use case, one screen, or one scoped fix. Max ~3–5 files, one layer, unless told otherwise.
- Build order per feature: domain → infrastructure → use case → API → UI. Never skip ahead to an unapproved layer.
- If a requirement changes, list the affected layers BEFORE editing.
- Never build anything listed under "Open Questions" in the spec without asking first.
- After every iteration, update `README.md` (pushed to GitHub with the iteration's commit): what's done, what's not done
  yet, and the major features added — written for the team and visitors, not as a commit log. `docs/PROGRESS.md` stays
  the detailed working log.
- After every iteration, stop and reply in exactly this format, then wait:

```
## What I did
- ...

## Why
- ...

## What's next
- ...

## Waiting for your go-ahead
```

## Showing work to Nour (required for every feature)
- After any change that affects what the app shows, run `npm run dev` and open http://localhost:3000 (the relevant page) so Nour can see it, and say in the report which URL to look at.
- **Both demo restaurants, always (Nour, 2026-10-10):** Demo Grill (`demo-dinein`) and Demo Coffee (`demo-takeout`) must stay on the same phase. After any change to a staff or customer screen, check it on BOTH hosts (`http://demo-dinein.localhost:3000`, `http://demo-takeout.localhost:3000`), in `/ar` and `/en`, and leave the demo data as you found it. Demo accounts: `supabase/seed.sql`.
- **The team's setup tool** lives on the address WITHOUT a restaurant in front: `http://localhost:3000/en/setup` (demo founder account in `supabase/seed.sql`). It must NOT exist on a restaurant's address (404 there). The same goes for the Staff screen (`/staff/team`): never press "Save role", "New temporary password" or "Remove" on a seeded demo member; add an `e2e-...@test.local` member and try it on that one. NEVER press "New temporary password" for a seeded demo owner when checking by hand: it replaces the demo password every test and demo depends on (try it on a restaurant you created, named `e2e-...` so the test cleanup removes it).
- Accounts the app creates (a new restaurant's owner) start with a temporary password: the first sign-in lands on `/staff/password` and nothing else opens until it is replaced. The seeded demo accounts are not affected.
- You run the commands yourself (npm, npx supabase, git) — don't ask Nour to copy-paste output. Ask before anything destructive.
- Docs are part of every iteration: `README.md` (for the team and visitors: what works, what does not, how to run it) and `docs/PROGRESS.md` (START HERE handoff + the log). When a phase, a count of tests or a decision changes, fix every place that states it, not only the newest entry; `PROJECT_SPEC.md` and the skills get the decision itself.

## Hosting
- Vercel (app) + Supabase (database, auth, storage, realtime). Secrets go in Vercel/Supabase env settings and `.env.local` (never committed); document variable names in `.env.example`.

## Commands
- Install: `npm install` (Node 22, see `.nvmrc`)
- Dev server: `npm run dev` -> http://localhost:3000
- Unit tests: `npm test` (Vitest, files `src/**/*.test.ts`)
- Integration tests (real adapters against the local Supabase; clean up after themselves): `npm run test:integration`
- Lint: `npm run lint` (also enforces layer import rules)
- Typecheck: `npm run typecheck`
- Everything before pushing: `npm run check`
- E2E (Playwright, real Chrome + local Supabase): `npm run test:e2e` (needs `npx supabase start`, and `npx supabase db reset` for known demo data). Playwright builds the app for production and starts that build itself on port 3100 in its own folder `.next-e2e` (`e2e/support/server.ts`): nothing else has to run, a dev server on port 3000 is not used and not disturbed, and the build adds about a minute. Specs in `e2e/`, helpers in `e2e/support/demo.ts`. Every spec loops over BOTH demo restaurants and /en + /ar; tests that change data put it back. NOT part of `npm run check` / CI. When a screen changes, update or add its spec in the same iteration.
- Local database (needs Docker): `npx supabase start` (Studio: http://localhost:54323), `npx supabase stop`
- Rebuild DB from migrations + seed: `npx supabase db reset`
- Database tests (pgTAP, RLS isolation): `npx supabase test db`
- New migration: `npx supabase migration new <name>` (never edit an applied migration; add a new one)

## Layout
- `src/domain/` — pure business rules (no framework imports; ESLint enforces)
- `src/application/use-cases/`, `src/application/ports/` — use cases + interfaces
- `src/interface/api/`, `src/interface/web/` — HTTP handlers, DTOs, UI components (`web/customer`, `web/staff`, `web/setup` = the founders' tool)
- `src/app/` — Next.js routes (thin; call interface/use cases)
- `src/infrastructure/` — Supabase, notifications; `container.ts` wires adapters (the ONLY infrastructure file the interface layer may import)
- `e2e/` — Playwright specs; `e2e/support/` helpers and the cleanup that runs before and after the suite
