# SmartMenu — instructions for Claude Code

Read `PROJECT_SPEC.md` at the start of every session. It is the source of truth.
Then read `docs/PROGRESS.md` to see where work stopped (its **START HERE** section at the top says what is done, what the next task is, how to run everything, and the pitfalls), and update it at the end of every iteration.

## Where the project is (update this block in every iteration)
- **Phase 6 (onboarding tools) is built** (2026-10-12): the team's setup tool, staff accounts, takeout, the owner's setup checklist, menu import from a spreadsheet, and menu import by AI. Summary for Nour: `docs/PHASE_6_SUMMARY.md`.
- **One thing is unproven:** the AI menu draft (`src/infrastructure/ai/anthropic-menu-draft-gateway.ts`) has never been run against the real service. It needs `ANTHROPIC_API_KEY` in `.env.local` and Nour's decision on cost; then try one real menu photo and fix whatever the real service says.
- Custom domains were moved to Phase 7 (Nour, 2026-10-12).
- After Phase 6 (Nour, 2026-10-12): the slow "Place order" was found and fixed (`StuckRenderGuard`), takeout orders got limits against abuse (database: `check_pickup_limits`), the cashier may cancel a takeout order, and the local database was rebuilt from scratch (every migration and the seed replay cleanly).
- **Since then (2026-10-13/14, all merged into `main`, PRs #1 and #2):** (1) the **AI ordering assistant** (grounded cart suggestions; Gemini default model `gemini-3.1-flash-lite`, Claude as the alternative; chat box; rate limits; a scripted stand-in AI server for the browser tests). It was tried live only on a FREE-TIER Google key (20 requests a day per model): Nour must rotate that key (it was pasted in chat) and enable billing before real customers use it. (2) **Guest services** (call the waiter / clean the table / ask for the bill): domain, database (`service_requests`, migration `20261014100000`), ports/adapters, use cases and the guest page `/<locale>/services` are built; the WAITER'S SCREEN is NOT (step S6). (3) The restaurant **home page has 3 options** (smart assistant, menu, services; services only where dine-in is on, so not at Demo Coffee), the plain menu has no assistant (the chat opens from the home card with `?assistant=1`), and the chat has suggested questions. Details and the plan: `docs/PROGRESS.md`, section "Guest services + 3-option home + suggestion chips".
- **2026-10-15 (PRs #3 and #4): testing safety net.** Nour now splits the work between **testing** and **security**. CI runs every test suite except the browser tests, split into one check per area of the app, and `main` is protected so nothing merges while a check is red. Read the section "Testing, CI and the protected `main`" below before pushing anything.
- **Next (Nour's choice, 2026-10-15): the SECURITY half.** Suggested order, not yet approved: (1) GitHub Dependabot alerts + secret scanning + push protection (Nour clicks them on) and an `npm audit` check in CI; (2) rotate the Gemini key; (3) a ranked security review (founder sign-in password-only, no rate limit on dine-in `placeOrderAction`, in-memory rate limits, AI chat history forgeable from the browser, no own attempt limit on "change my password", security headers / CSP, uploads); (4) fix one finding per iteration, each with a test in its area. Ask Nour before starting. S6 (the waiter's screen for service requests) is still open as a feature task.
- Last verified counts (2026-10-15): 647 unit, 45 integration (+4 CI guard checks), 482 database (pgTAP), about 216 browser tests (local only; the last single full run, 184 tests, came before the services, home-page and chips specs).

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
- **Both demo restaurants, always (Nour, 2026-10-10):** Demo Grill (`demo-dinein`) and Demo Coffee (`demo-takeout`) must stay on the same phase. After any change to a staff or customer screen, check it on BOTH hosts (`http://demo-dinein.localhost:3000`, `http://demo-takeout.localhost:3000`), in `/ar` and `/en`, and leave the demo data as you found it. Demo accounts: `supabase/seed.sql`. Both demo restaurants take TAKEOUT orders (Demo Coffee nothing else): when trying takeout by hand, call the customer "E2E something" so the test cleanup removes the order, or cancel it on the staff order screen.
- **The team's setup tool** lives on the address WITHOUT a restaurant in front: `http://localhost:3000/en/setup` (demo founder account in `supabase/seed.sql`). It must NOT exist on a restaurant's address (404 there). The same goes for the Staff screen (`/staff/team`): never press "Save role", "New temporary password" or "Remove" on a seeded demo member; add an `e2e-...@test.local` member and try it on that one. NEVER press "New temporary password" for a seeded demo owner when checking by hand: it replaces the demo password every test and demo depends on (try it on a restaurant you created, named `e2e-...` so the test cleanup removes it).
- Accounts the app creates (a new restaurant's owner) start with a temporary password: the first sign-in lands on `/staff/password` and nothing else opens until it is replaced. The seeded demo accounts are not affected.
- You run the commands yourself (npm, npx supabase, git) — don't ask Nour to copy-paste output. Ask before anything destructive.
- Docs are part of every iteration: `README.md` (for the team and visitors: what works, what does not, how to run it) and `docs/PROGRESS.md` (START HERE handoff + the log). When a phase, a count of tests or a decision changes, fix every place that states it, not only the newest entry; `PROJECT_SPEC.md` and the skills get the decision itself.

## Testing, CI and the protected `main` (set up 2026-10-15, Nour: "when something breaks, the pipeline must be red")
- **`main` is protected** (GitHub ruleset "Run CI on every push"): no direct pushes, no force pushes, no deleting. Every change goes **branch → pull request → all checks green → merge**. That includes docs-only changes and your own handoff notes. Never try to bypass it.
- **One check per area.** `test-groups.json` lists 9 areas (platform, staff, menu, orders, tables, restaurant = settings & branding, services, assistant, basics) and the unit / integration / pgTAP files of each. CI (`.github/workflows/ci.yml`) runs: `Test groups`, `Typecheck`, `Lint & architecture rules`, `Production build`, `Unit - <area>` (x9) and `Database - <area>` (x8, each with its own Supabase in Docker: that area's pgTAP, then its integration tests). A red check names the broken area; the failing test's name says which rule.
- **The gates `check` and `database`** only collect those results. The ruleset requires exactly these two names: never rename or remove these jobs (renaming blocks every PR). A new job must be added to a gate's `needs:`.
- **Adding a test file:** put it in its area in `test-groups.json`, otherwise `Test groups` goes red (`npm run test:groups` checks locally). Run one area: `npx vitest run --project <id>`; one area's database tests: `npx supabase test db supabase/tests/database/<file>.test.sql`.
- **Integration tests skip themselves without Supabase settings** (so `npm test` works without a database). In CI the `REQUIRE_SUPABASE=1` guard (`src/infrastructure/supabase/environment.integration.test.ts`) turns missing settings into a failure, never a silent green.
- **Every fix or feature comes with a test in the right area**, so the same bug cannot come back unnoticed. When you fix a bug, first write the test that fails because of it.
- **Before pushing a workflow file,** parse it locally (`node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`): an unquoted `: ` inside a step name made the whole workflow invalid once (0-second red run, no jobs).
- The browser tests (`npm run test:e2e`) are NOT in CI yet: run them locally when a screen changes.

## Hosting
- Vercel (app) + Supabase (database, auth, storage, realtime). Secrets go in Vercel/Supabase env settings and `.env.local` (never committed); document variable names in `.env.example`.

## Commands
- Install: `npm install` (Node 22, see `.nvmrc`)
- Dev server: `npm run dev` -> http://localhost:3000
- Unit tests: `npm test` (Vitest, files `src/**/*.test.ts`); one area: `npx vitest run --project orders`
- Test areas: every test file (unit, `*.integration.test.ts`, pgTAP) belongs to exactly ONE area in `test-groups.json`; CI runs each area as its own check. A new test file must be added there (`npm run test:groups` checks it; CI fails otherwise).
- Integration tests (real adapters against the local Supabase; clean up after themselves): `npm run test:integration`
- Lint: `npm run lint` (also enforces layer import rules)
- Typecheck: `npm run typecheck`
- Everything before pushing: `npm run check`
- `main` is protected: work on a branch, open a PR; it merges only when the `check` and `database` gates are green.
- E2E (Playwright, real Chrome + local Supabase): `npm run test:e2e` (needs `npx supabase start`, and `npx supabase db reset` for known demo data). Playwright builds the app for production and starts that build itself on port 3100 in its own folder `.next-e2e` (`e2e/support/server.ts`): nothing else has to run, a dev server on port 3000 is not used and not disturbed, and the build adds about a minute. Specs in `e2e/`, helpers in `e2e/support/demo.ts`. Every spec loops over BOTH demo restaurants and /en + /ar; tests that change data put it back. NOT part of `npm run check` / CI. When a screen changes, update or add its spec in the same iteration. The suite also starts a scripted stand-in for the AI service (`e2e/support/fake-gemini.mjs`, port 3199) and gives the test server `GEMINI_API_KEY`/`GEMINI_BASE_URL` pointing at it, so no real key or AI call is ever used. Services need tables: only Demo Grill has them (Demo Coffee is takeout only), so the services specs use Grill (plus "no table" checks on both).
- Windows PowerShell on Nour's machine blocks `npx.ps1`: use `npx.cmd` (or Command Prompt). After pulling new migrations run `npx supabase db reset` (not only `migration up`), or the setup and tables specs fail on a stale seed.
- AI assistant settings (`.env.example`): `GEMINI_API_KEY` (preferred) or `ANTHROPIC_API_KEY`, optional `ORDERING_ASSISTANT_MODEL`, `GEMINI_BASE_URL`. Never paste a key in chat or commit it; without a key the assistant is simply not offered.
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
