-- Phase 2 step 2: restaurants, members (roles), settings — tenant-isolated with RLS.
-- Rules: data-model skill (restaurant_id everywhere, UUIDs, bilingual, RLS on every tenant table).

-- ─── Types ──────────────────────────────────────────────────────────────
create type public.app_role as enum ('OWNER', 'MANAGER', 'WAITER', 'CASHIER');

-- ─── restaurants ────────────────────────────────────────────────────────
create table public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' and slug not like '%--%'),
  name_en     text not null check (length(trim(name_en)) > 0),
  name_ar     text not null check (length(trim(name_ar)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- ─── restaurant_settings (1:1 with restaurants) ─────────────────────────
create table public.restaurant_settings (
  restaurant_id      uuid primary key references public.restaurants(id) on delete cascade,
  dine_in_enabled    boolean not null default true,
  takeout_enabled    boolean not null default true,
  delivery_enabled   boolean not null default false,
  tax_rate_bp        integer not null default 1600 check (tax_rate_bp between 0 and 10000),
  service_charge_bp  integer not null default 0    check (service_charge_bp between 0 and 10000),
  default_language   text    not null default 'ar' check (default_language in ('ar', 'en')),
  branding           jsonb   not null default '{}'::jsonb,
  updated_at         timestamptz,
  constraint at_least_one_order_mode check (dine_in_enabled or takeout_enabled or delivery_enabled)
);

-- ─── restaurant_members (staff ↔ restaurant, with role) ─────────────────
create table public.restaurant_members (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           public.app_role not null,
  created_at     timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
create index restaurant_members_user_idx on public.restaurant_members (user_id);

-- ─── updated_at trigger ─────────────────────────────────────────────────
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger restaurants_updated_at before update on public.restaurants
  for each row execute function public.set_updated_at();
create trigger restaurant_settings_updated_at before update on public.restaurant_settings
  for each row execute function public.set_updated_at();

-- ─── Membership helper ──────────────────────────────────────────────────
-- SECURITY DEFINER so RLS policies on restaurant_members can call it without recursion.
create function public.has_restaurant_role(rid uuid, roles public.app_role[] default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = rid
      and m.user_id = (select auth.uid())
      and (roles is null or m.role = any (roles))
  );
$$;
revoke all on function public.has_restaurant_role(uuid, public.app_role[]) from public, anon;
grant execute on function public.has_restaurant_role(uuid, public.app_role[]) to authenticated;

-- ─── Row Level Security ─────────────────────────────────────────────────
alter table public.restaurants         enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.restaurant_members  enable row level security;

-- Anonymous visitors get nothing directly. (Public customer menu will be served
-- through a dedicated read path in a later step.)
revoke all on public.restaurants, public.restaurant_settings, public.restaurant_members from anon;

-- restaurants: members read; owner updates. Creating/deleting restaurants is done
-- by the founders' setup tool with the service role, so no insert/delete policy.
create policy "members read their restaurant" on public.restaurants
  for select to authenticated using (public.has_restaurant_role(id));
create policy "owner updates restaurant" on public.restaurants
  for update to authenticated
  using (public.has_restaurant_role(id, array['OWNER']::public.app_role[]))
  with check (public.has_restaurant_role(id, array['OWNER']::public.app_role[]));

-- settings: members read; only owner updates (role.ts: restaurant:settings).
create policy "members read settings" on public.restaurant_settings
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
create policy "owner updates settings" on public.restaurant_settings
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER']::public.app_role[]));

-- members: members see colleagues; owner/manager manage staff (role.ts: staff:manage).
-- Only an owner may create or assign the OWNER role.
create policy "members read colleagues" on public.restaurant_members
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
create policy "owner/manager add staff" on public.restaurant_members
  for insert to authenticated
  with check (
    public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[])
    and (role <> 'OWNER' or public.has_restaurant_role(restaurant_id, array['OWNER']::public.app_role[]))
  );
create policy "owner/manager change staff" on public.restaurant_members
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]))
  with check (
    public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[])
    and (role <> 'OWNER' or public.has_restaurant_role(restaurant_id, array['OWNER']::public.app_role[]))
  );
create policy "owner/manager remove staff" on public.restaurant_members
  for delete to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[])
    and (role <> 'OWNER' or public.has_restaurant_role(restaurant_id, array['OWNER']::public.app_role[]))
  );
