-- Phase 4 step 2: orders (mirrors src/domain/order/order.ts).
--   orders              one customer order (a "batch") inside a table session
--   order_items         its lines, with a SNAPSHOT of the item name/price at order time
--   order_item_options  the options picked on a line, with a SNAPSHOT of names/prices
--   order_counters      per-restaurant counter behind the human-friendly order number
-- Customers have no accounts, so nobody inserts orders as `authenticated` yet: orders will be created by a
-- narrow SECURITY DEFINER function in the customer-ordering step (and by service_role until then).
-- Staff read orders and move them along the status flow; nothing else about an order can change.

-- ─── Status flow ────────────────────────────────────────────────────────
-- NEW -> CONFIRMED -> PREPARING -> READY -> SERVED -> COMPLETED. CANCELLED is NOT here on purpose:
-- its rules still need the founders' decision (data-model skill §8); ALTER TYPE ... ADD VALUE adds it later.
create type public.order_status as enum ('NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED');

-- ─── Per-restaurant order numbers ───────────────────────────────────────
create table public.order_counters (
  restaurant_id  uuid primary key references public.restaurants(id) on delete cascade,
  last_number    integer not null default 0 check (last_number >= 0)
);

-- Hands out 1, 2, 3 ... per restaurant. Row-locks the counter, so two orders at the same moment get
-- different numbers. The app calls it as its own step BEFORE place_order, so an order that then fails leaves a
-- GAP in the numbers (accepted: they are for the kitchen, not for tax numbering). If gap-free numbers are ever
-- required, assign the number inside place_order instead.
create function public.next_order_number(p_restaurant_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.order_counters as c (restaurant_id, last_number) values (p_restaurant_id, 1)
  on conflict (restaurant_id) do update set last_number = c.last_number + 1
  returning c.last_number into n;
  return n;
end $$;

-- ─── orders ─────────────────────────────────────────────────────────────
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references public.restaurants(id) on delete cascade,
  -- The table session this order belongs to. No foreign key yet: table_sessions arrives with the
  -- table-session step, which adds the constraint (and its tenant check).
  session_id           uuid not null,
  number               integer not null check (number >= 1),
  status               public.order_status not null default 'NEW',
  subtotal_fils        bigint not null check (subtotal_fils between 0 and 1000000000),
  service_charge_fils  bigint not null check (service_charge_fils between 0 and 1000000000),
  tax_fils             bigint not null check (tax_fils between 0 and 1000000000),
  total_fils           bigint not null check (total_fils between 0 and 1000000000),
  -- Rates in force when the order was placed (basis points); later settings changes never touch it.
  tax_rate_bp          integer not null check (tax_rate_bp between 0 and 10000),
  service_charge_bp    integer not null check (service_charge_bp between 0 and 10000),
  created_at           timestamptz not null default now(),
  status_changed_at    timestamptz not null default now(),
  check (total_fils = subtotal_fils + service_charge_fils + tax_fils),
  unique (restaurant_id, number),
  unique (restaurant_id, id)
);
create index orders_restaurant_status_idx on public.orders (restaurant_id, status, created_at desc);
create index orders_restaurant_session_idx on public.orders (restaurant_id, session_id);

-- ─── order_items (price snapshot) ───────────────────────────────────────
create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  order_id         uuid not null,
  -- Reference only: the live menu item may be renamed, repriced or soft-deleted later.
  menu_item_id     uuid not null,
  name_en          text not null check (length(trim(name_en)) >= 1),
  name_ar          text not null check (length(trim(name_ar)) >= 1),
  unit_price_fils  bigint not null check (unit_price_fils between 0 and 1000000000),
  quantity         integer not null check (quantity between 1 and 99),
  -- (unit price + picked options) x quantity, so never less than unit price x quantity.
  line_total_fils  bigint not null check (line_total_fils between 0 and 1000000000),
  -- Position on the receipt / ticket (0 = first line), so lines always come back in the order they were ordered.
  position         integer not null default 0 check (position >= 0),
  check (line_total_fils >= unit_price_fils * quantity),
  unique (restaurant_id, id),
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, menu_item_id) references public.menu_items (restaurant_id, id)
);
create index order_items_restaurant_order_idx on public.order_items (restaurant_id, order_id);

-- ─── order_item_options (price snapshot) ────────────────────────────────
alter table public.options add constraint options_restaurant_id_id_key unique (restaurant_id, id);

create table public.order_item_options (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  order_item_id     uuid not null,
  option_id         uuid not null,
  group_name_en     text not null check (length(trim(group_name_en)) >= 1),
  group_name_ar     text not null check (length(trim(group_name_ar)) >= 1),
  name_en           text not null check (length(trim(name_en)) >= 1),
  name_ar           text not null check (length(trim(name_ar)) >= 1),
  price_delta_fils  bigint not null check (price_delta_fils between 0 and 1000000000),
  position          integer not null default 0 check (position >= 0),
  foreign key (restaurant_id, order_item_id) references public.order_items (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, option_id) references public.options (restaurant_id, id)
);
create index order_item_options_restaurant_item_idx on public.order_item_options (restaurant_id, order_item_id);

-- ─── Status flow, enforced by the database too ──────────────────────────
-- One step forward at a time, no skipping, no going back, nothing after COMPLETED (domain: moveOrderTo).
-- Applies to every role, service_role included.
create function public.orders_enforce_status_flow() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status is distinct from (enum_range(old.status, null))[2] then
      raise exception 'order status cannot go from % to %', old.status, new.status using errcode = '23514';
    end if;
    new.status_changed_at := now();
  end if;
  return new;
end $$;

create trigger orders_status_flow before update of status on public.orders
  for each row execute function public.orders_enforce_status_flow();

-- ─── Row Level Security ─────────────────────────────────────────────────
alter table public.order_counters     enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.order_item_options enable row level security;

-- order_counters: no policy at all. Only next_order_number() (SECURITY DEFINER) touches it.

create policy "members read orders" on public.orders
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
create policy "members read order items" on public.order_items
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
create policy "members read order item options" on public.order_item_options
  for select to authenticated using (public.has_restaurant_role(restaurant_id));

-- Moving an order along is role.ts `orders:confirm` (OWNER, MANAGER, WAITER). Cashiers read orders;
-- how they complete a paid session is decided with the table-session / payment step.
create policy "order handlers move orders" on public.orders
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER']::public.app_role[]));

-- ─── Privileges ─────────────────────────────────────────────────────────
revoke all on public.order_counters, public.orders, public.order_items, public.order_item_options from anon, authenticated;
revoke all on function public.next_order_number(uuid) from public, anon, authenticated;

grant select on public.orders, public.order_items, public.order_item_options to authenticated;
-- The ONLY column staff may change on an order. Totals, rates, number and snapshots are fixed once placed.
grant update (status) on public.orders to authenticated;

grant all on public.order_counters, public.orders, public.order_items, public.order_item_options to service_role;
grant execute on function public.next_order_number(uuid) to service_role;
