# SmartMenu — instructions for Claude Code

Read `PROJECT_SPEC.md` at the start of every session. It is the source of truth.
Then read `docs/PROGRESS.md` to see where work stopped, and update it at the end of every iteration.

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
- You run the commands yourself (npm, npx supabase, git) — don't ask Nour to copy-paste output. Ask before anything destructive.

## Hosting
- Vercel (app) + Supabase (database, auth, storage, realtime). Secrets go in Vercel/Supabase env settings and `.env.local` (never committed); document variable names in `.env.example`.

## Commands
- Install: `npm install` (Node 22, see `.nvmrc`)
- Dev server: `npm run dev` -> http://localhost:3000
- Unit tests: `npm test` (Vitest, files `src/**/*.test.ts`)
- Lint: `npm run lint` (also enforces layer import rules)
- Typecheck: `npm run typecheck`
- Everything before pushing: `npm run check`
- E2E (Playwright, real Chrome + local Supabase): `npm run test:e2e` (needs `npx supabase start` + `npx supabase db reset` first; reuses a running `npm run dev`). Specs in `e2e/`, helpers in `e2e/support/demo.ts`. Every spec loops over BOTH demo restaurants and /en + /ar; tests that change data put it back. NOT part of `npm run check` / CI. When a screen changes, update or add its spec in the same iteration.
- Local database (needs Docker): `npx supabase start` (Studio: http://localhost:54323), `npx supabase stop`
- Rebuild DB from migrations + seed: `npx supabase db reset`
- Database tests (pgTAP, RLS isolation): `npx supabase test db`
- New migration: `npx supabase migration new <name>` (never edit an applied migration; add a new one)

## Layout
- `src/domain/` — pure business rules (no framework imports; ESLint enforces)
- `src/application/use-cases/`, `src/application/ports/` — use cases + interfaces
- `src/interface/api/`, `src/interface/web/` — HTTP handlers, DTOs, UI components
- `src/app/` — Next.js routes (thin; call interface/use cases)
- `src/infrastructure/` — Supabase, notifications; `container.ts` wires adapters
