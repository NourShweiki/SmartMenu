# SmartMenu — instructions for Claude Code

Read `PROJECT_SPEC.md` at the start of every session. It is the source of truth.

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

## Commands
- Install: `npm install` (Node 22, see `.nvmrc`)
- Dev server: `npm run dev` -> http://localhost:3000
- Unit tests: `npm test` (Vitest, files `src/**/*.test.ts`)
- Lint: `npm run lint` (also enforces layer import rules)
- Typecheck: `npm run typecheck`
- Everything before pushing: `npm run check`
- E2E (Playwright): not set up yet

## Layout
- `src/domain/` — pure business rules (no framework imports; ESLint enforces)
- `src/application/use-cases/`, `src/application/ports/` — use cases + interfaces
- `src/interface/api/`, `src/interface/web/` — HTTP handlers, DTOs, UI components
- `src/app/` — Next.js routes (thin; call interface/use cases)
- `src/infrastructure/` — Supabase, notifications; `container.ts` wires adapters
