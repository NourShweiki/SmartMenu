---
name: architecture-rules
description: Clean Architecture layer rules for SmartMenu. Use before creating, moving or editing any TypeScript file in domain/, application/, interface/ or infrastructure/, and when reviewing imports or deciding where new code belongs.
---

# Architecture rules (SmartMenu)

Four layers. Dependencies point INWARD only.

```
infrastructure  ->  interface  ->  application  ->  domain
(outer)                                           (inner)
```

## What each layer may contain and import

| Layer | Folder | Contains | May import | Must NOT import |
|---|---|---|---|---|
| Domain | `src/domain/<context>/` | Entities, value objects, status enums, state-transition rules, domain errors | Other domain code only | Next.js, React, Supabase, zod, `fetch`, `process.env`, `Date.now()` directly (pass a clock) |
| Application | `src/application/use-cases/` + `src/application/ports/` | One use case per file; port interfaces (repositories, notifier, clock, id generator) | domain, own ports | Supabase, Next.js, any SDK, infrastructure |
| Interface | `src/interface/api/`, `src/app/` (Next.js routes), `src/interface/web/` | HTTP handlers, request/response DTOs + validation, UI components | application, domain types | Supabase client, SMS/push SDKs |
| Infrastructure | `src/infrastructure/supabase/`, `src/infrastructure/notifications/` | Adapters implementing ports, DB mappers, SDK clients | application ports, domain | interface |

The ONLY place `@supabase/*`, SMS or push SDKs are imported is `src/infrastructure/`. Wiring (choosing which adapter implements which port) lives in one composition root: `src/infrastructure/container.ts`.

## Bounded contexts (domain folders)
`restaurant`, `table-session`, `order`, `menu`. Add a new one only when told to.

## Patterns to follow

**Use case shape**
```ts
// src/application/use-cases/confirm-order.ts
export type ConfirmOrderInput = { restaurantId: string; orderId: string; actorId: string };
export function makeConfirmOrder(deps: { orders: OrderRepository; clock: Clock }) {
  return async (input: ConfirmOrderInput): Promise<Result<Order, OrderError>> => {
    const order = await deps.orders.findById(input.restaurantId, input.orderId);
    if (!order) return err({ type: "ORDER_NOT_FOUND" });
    const next = confirmOrder(order, deps.clock.now()); // domain rule
    if (!next.ok) return next;
    await deps.orders.save(next.value);
    return next;
  };
}
```
- Dependencies injected through a `deps` object. No module-level singletons.
- Every use case input carries `restaurantId` (tenant scope, see `data-model` skill).
- Expected failures are returned as a `Result` type, never thrown. Throw only for real bugs.

**Domain rule shape:** pure functions or immutable entities returning new values. A status change is a function that checks the allowed transition and returns a `Result`.

**API route shape:** parse + validate input (zod lives here, not in domain) -> resolve tenant and actor from the request -> call one use case -> map `Result` to HTTP status. No business logic in routes.

## Tests
- Domain and use cases get unit tests (Vitest) with in-memory fakes of ports. No database needed.
- Test files sit next to the code: `confirm-order.test.ts`.

## Before finishing any change, check
1. Does any file in `domain/` or `application/` import a framework or SDK? -> move it out.
2. Is there business logic in a route or React component? -> move it into domain/use case.
3. Does a use case call infrastructure directly instead of through a port? -> add a port.
4. Did the change touch more than one layer? -> say so in the iteration report (blast radius).
