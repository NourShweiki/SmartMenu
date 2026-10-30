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
- Order: `NEW -> CONFIRMED -> PREPARING -> READY -> SERVED -> COMPLETED`, plus `CANCELLED` outside the flow (built; staff only, by role, with a reason, final, zero on the bill: PROJECT_SPEC.md §4). The database trigger enforces the flow and the roles.
- Items added after confirmation create a NEW order/batch in the same session; they do not reopen a confirmed one.
- Table session: `OPEN -> PAYMENT_REQUESTED -> CLOSED` (built; closes by itself 2 hours after it starts; cannot be closed over unfinished orders). A table has no stored status: it is "occupied" while it has a live session. Confirm extra states with the user before adding.
- **A session is a TABLE visit or a PICKUP visit** (`table_sessions.kind`; takeout, built 2026-10-12): a pickup visit has NO table (`table_id` null) and carries `customer_name` + `customer_phone` (E.164) instead; a check constraint keeps the two shapes apart. It is created by `place_order` together with its first order (payload key `pickup`), never on its own, and closes itself when its last order is COMPLETED or CANCELLED. Any query that joins sessions to tables must be a LEFT join.
- Takeout orders carry no service charge (`pickupRates`); on a PICKUP order the CASHIER may do every status step and cancel (a table order: only complete).
- Starting a pickup visit is LIMITED inside `place_order` (`check_pickup_limits`: per phone number, per device hash, per restaurant's waiting queue); the refusals are SQLSTATE PK001 / PK002 / PK003, which the adapter turns into `PickupLimitReached`.
- On READY: notify the session's devices (built as a notice on the guests' open menu page; no SMS for now).

## 9. Roles
`OWNER`, `MANAGER`, `WAITER`, `CASHIER`, attached per restaurant through a `restaurant_members(user_id, restaurant_id, role)` table. A user can belong to several restaurants.
- Waiters handle service requests; cashiers do NOT see them.
- Customers have no accounts. Loyalty identifies customers by phone number (E.164 format, e.g. `+9627XXXXXXXX`).
- **Founders are not a restaurant role.** They are rows in `platform_admins(user_id)`, added by hand (no insert path from any screen); a user can read only their own row. Being a founder gives NO access to any restaurant's data through RLS. Work that crosses tenants (creating a restaurant) goes through a SECURITY DEFINER function granted to `service_role` only that checks the founder again inside (`create_restaurant(p_actor_id, ...)`, `list_restaurant_owners(p_actor_id, ...)`). Account emails live in `auth.users`: never expose them through a table grant, only through such a function with an explicit column list.
- **Membership rules the database enforces** (`restaurant_members_guard`, migration `staff_management`): a signed-in person cannot change or delete their OWN membership; a restaurant always keeps at least one OWNER (also when the owner's account is deleted); OWNER and MANAGER manage staff, and only an OWNER may give the OWNER role. Staff emails are read through `list_restaurant_staff(restaurant_id)` (owner / manager of that restaurant only).
- **Service-role power over accounts stays inside one restaurant:** before the server creates, attaches or resets an account for a restaurant it asks `find_unattached_account(actor, restaurant, email)` (an existing account may be taken on only if it belongs to NO restaurant and is not a founder's) or `is_resettable_staff_account(actor, restaurant, user)` (a non-owner member of this restaurant only, working nowhere else, not the actor). Both check the actor again.
- **Staff accounts are made FOR people, never by sign-up.** They start with a temporary password, marked in the account's `app_metadata.must_change_password` (server-written, carried in the session token); until it is replaced the app opens nothing but the change-password page. Passwords: at least 10 characters, at most 72 bytes.

**Platform-wide tables (no restaurant_id):** a few tables hold no tenant data and are used by the SERVER only:
`sign_in_failures` (failed sign-ins, keyed by SHA-256 hashes of the email typed or the visitor's address, 2026-10-30).
RLS on with NO policies, nothing granted to anon/authenticated, functions granted to service_role only. Never store a
plain email or address there.

## 10. Open questions — stop and ask before building these
- Removing SINGLE items from a placed order (cancelling the whole order is decided and built).
- Delivery equivalent of a table session.
- (Takeout is decided, 2026-10-11: a "pickup visit" = a session without a table, with the customer's name and phone; see PROJECT_SPEC.md §4 "Takeout design".)
- Loyalty earn/redeem rules.
- (Decided, no longer open: branding elements = logo + one accent colour of 8 + written details; cancellation rules; takeout design.)

## 11. Table privileges (learned 2026-10-06, corrected 2026-10-10)
Whether a new table gets privileges automatically DEPENDS ON THE SUPABASE VERSION: some give `anon`/`authenticated`
nothing, newer ones give them ALL (DELETE, TRUNCATE, every column). Never rely on the default. Every migration that
creates a table must pin its privileges explicitly:
- `revoke all on <table> from anon, authenticated;` FIRST, then
- `grant` exactly the operations its RLS policies cover to `authenticated` (and to `anon` only if there is a deliberate public policy),
  using column-level `grant update (col, ...)` for anything that must stay fixed (restaurant_id, totals, snapshots),
- `grant all ... to service_role`.
Missing grants show up as `permission denied for table X` (SQLSTATE 42501) even for rightful users; too many grants show up
only in tests such as "staff cannot hard-delete". Migration `20261010120100_pin_table_privileges.sql` fixed the older tables
and stops future tables from getting default grants; the pgTAP suites are what catches a regression.
