---
name: data-model
description: Locked data-model constraints for SmartMenu (multi-tenant restaurant_id, money in fils, price snapshots, UUIDs, bilingual fields, statuses, roles). Use whenever writing domain entities, SQL migrations, Supabase RLS policies, repositories, or anything that stores or calculates money.
---

# Data model rules (SmartMenu)

These are decided and expensive to change. Do not deviate without the user's explicit approval.

## 1. Multi-tenancy
- Every tenant-owned table has `restaurant_id uuid not null references restaurants(id)`.
- Every tenant-owned table has Row Level Security ENABLED, with policies scoped to `restaurant_id`. A table without RLS is a bug.
- Every repository method takes `restaurantId` as its first argument and filters by it, even though RLS also does. Defense in depth.
- Composite indexes start with `restaurant_id`.
- Never accept `restaurant_id` from the request body. Resolve it from the domain/subdomain (customers) or the authenticated staff user's membership (staff).
- Tests for isolation: any new table needs a test proving restaurant A cannot read/write restaurant B's rows.

## 2. IDs
- `uuid` primary keys, `default gen_random_uuid()`. Never `serial`/`identity`.
- Human-friendly numbers (e.g. order #42 shown to kitchen) are a separate per-restaurant column, never the PK.

## 3. Money
- JOD has 3 decimals. Store money as integer **fils** (1 JOD = 1000 fils). Column type `bigint`, name ends in `_fils` (`unit_price_fils`, `total_fils`).
- In TypeScript use a branded type: `type Fils = number & { readonly __brand: "Fils" }`. No floats, no `toFixed` math. Format to "1.250 JD" only at the UI edge.
- Orders carry `subtotal_fils`, `tax_fils`, `service_charge_fils`, `total_fils`. Tax/service rates are restaurant settings stored in basis points (`tax_rate_bp`, 1600 = 16%).
- Rounding: compute in fils with a single documented rounding step (round half up) per line, and test it.

## 4. Price snapshots
- `order_items` copies `name_en`, `name_ar`, `unit_price_fils` and chosen modifiers (names + prices) at order time. It keeps `menu_item_id` only as a reference.
- Never compute an existing order's total by joining to current menu prices.

## 5. Bilingual text
- Customer-visible text is stored as paired columns: `name_en`, `name_ar`, `description_en`, `description_ar`. In domain code: `type LocalizedText = { en: string; ar: string }`.
- Both required for menu items/categories unless the restaurant setting says single-language. See `arabic-rtl` skill.

## 6. Timestamps
- `created_at timestamptz not null default now()`, `updated_at timestamptz`. Store UTC; display in `Asia/Amman`.
- Soft delete (`deleted_at`) for menu items and categories, because old orders reference them.

## 7. Settings, not code
- Per-restaurant behavior lives in a `restaurant_settings` row (typed columns for core toggles: `dine_in_enabled`, `takeout_enabled`, `delivery_enabled`, tax/service rates, default language) plus a validated `jsonb` for branding.
- Never write `if (restaurantId === "...")`. If a client needs special behavior, it becomes a setting.

## 8. Statuses (domain enums, mirrored as Postgres enums or checked text)
- Order: `NEW -> CONFIRMED -> PREPARING -> READY -> SERVED -> COMPLETED` (plus `CANCELLED`; confirm cancellation rules with the user before implementing).
- Items added after confirmation create a NEW order/batch in the same session; they do not reopen a confirmed one.
- Table session: `OPEN -> PAYMENT_REQUESTED -> CLOSED`; table: `AVAILABLE`/`OCCUPIED`. Confirm extra states with the user before adding.
- On READY: notify the session's devices.

## 9. Roles
`OWNER`, `MANAGER`, `WAITER`, `CASHIER`, attached per restaurant through a `restaurant_members(user_id, restaurant_id, role)` table. A user can belong to several restaurants.
- Waiters handle service requests; cashiers do NOT see them.
- Customers have no accounts. Loyalty identifies customers by phone number (E.164 format, e.g. `+9627XXXXXXXX`).

## 10. Open questions — stop and ask before building these
- Removing items after an order is confirmed.
- Takeout/delivery equivalent of a table session.
- Loyalty earn/redeem rules.
- Exact list of owner-editable branding elements.

## 11. Table privileges (learned 2026-10-06)
New Supabase projects do NOT auto-grant privileges on new tables. Every migration that creates a table must also:
- `grant` exactly the operations its RLS policies cover to `authenticated` (and to `anon` only if there is a deliberate public policy),
- `grant all ... to service_role`.
Missing grants show up as `permission denied for table X` (SQLSTATE 42501) even for rightful users.
