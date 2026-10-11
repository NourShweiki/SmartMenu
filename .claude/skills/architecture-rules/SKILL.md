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
`restaurant`, `table-session`, `order`, `menu`, plus `cart` (the customer's cart, added in Phase 4) and `shared` (money, result, localized text, id and password rules used by several contexts). Add a new one only when told to.

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

## Rules learned while building (2026-10)
- **Interface -> infrastructure goes through ONE door:** UI code and Server Actions import `@/infrastructure/container` and nothing else from infrastructure (ESLint enforces it). The container exposes ready-wired use cases (`menu.addItem`, `orders.place`, `platform.createRestaurant`, ...).
- **Form logic is pure and lives next to its action:** a `"use server"` file may only export async functions, so reading a form and mapping use-case errors to field messages goes into a `*-model.ts` file with its own unit test (`settings-form-model.ts`, `new-restaurant-model.ts`, `password-model.ts`).
- **The tenant never comes from the request body.** Staff pages and actions start with `requireStaff(locale)` (restaurant from the host, person and role from the session); the founders' tool starts with `requireFounder(locale)` (platform address only).
- **Which Supabase client:** the signed-in user's session client by default (RLS decides again); the public client for the narrow public functions; the service-role client ONLY for what has no signed-in user or crosses tenants (placing a customer's order, the founders' tool, clearing one's own temporary-password mark), always behind a check in the use case.
- **Ports that cross tenants** (`RestaurantDirectory`, `AccountDirectory`) take no `restaurantId`; they may only be called from use cases that check the founder (or the acting person) first.
- **A session has a kind.** `TableSession.kind` is `"TABLE"` or `"PICKUP"` (takeout); a pickup visit has `tableId: null` and a `customer`. Code that needs a table must check the kind (`PublicSession` is a union on it); code that decides who may move an order uses `permissionsToMoveTo(status, kind)`; a use case that places an order is told the kind and drops the service charge itself for a pickup visit.
- **One known exception:** `src/infrastructure/customer-order.integration.test.ts` imports the interface layer to test the whole ordering path; do not copy that in production code.

## Tests
- Domain and use cases get unit tests (Vitest) with in-memory fakes of ports. No database needed.
- Test files sit next to the code: `confirm-order.test.ts`.

## Before finishing any change, check
1. Does any file in `domain/` or `application/` import a framework or SDK? -> move it out.
2. Is there business logic in a route or React component? -> move it into domain/use case.
3. Does a use case call infrastructure directly instead of through a port? -> add a port.
4. Did the change touch more than one layer? -> say so in the iteration report (blast radius).
