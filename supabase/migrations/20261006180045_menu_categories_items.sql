-- Phase 3 step 2: menu categories + items (mirrors src/domain/menu/menu.ts).
-- Rules: data-model skill — restaurant_id everywhere, UUIDs, bilingual, money in fils,
-- soft delete for menu rows (old orders reference them), RLS on every tenant table.

-- ─── menu_categories ────────────────────────────────────────────────────
create table public.menu_categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name_en        text not null check (length(trim(name_en)) between 1 and 80),
  name_ar        text not null check (length(trim(name_ar)) between 1 and 80),
  sort_order     integer not null default 0 check (sort_order >= 0),
  is_hidden      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  deleted_at     timestamptz,
  -- Target for the composite FK below (an item's category must be in the same restaurant).
  unique (restaurant_id, id)
);
create index menu_categories_restaurant_order_idx
  on public.menu_categories (restaurant_id, sort_order) where deleted_at is null;

-- ─── menu_items ─────────────────────────────────────────────────────────
create table public.menu_items (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  category_id     uuid not null,
  name_en         text not null check (length(trim(name_en)) between 1 and 80),
  name_ar         text not null check (length(trim(name_ar)) between 1 and 80),
  description_en  text not null default '' check (length(description_en) <= 500),
  description_ar  text not null default '' check (length(description_ar) <= 500),
  price_fils      bigint not null check (price_fils between 0 and 1000000000),
  sort_order      integer not null default 0 check (sort_order >= 0),
  is_hidden       boolean not null default false,
  is_sold_out     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  deleted_at      timestamptz,
  -- Tenant safety in the schema itself: an item can never point at another restaurant's category.
  foreign key (restaurant_id, category_id) references public.menu_categories (restaurant_id, id)
);
create index menu_items_restaurant_category_idx
  on public.menu_items (restaurant_id, category_id, sort_order) where deleted_at is null;

create trigger menu_categories_updated_at before update on public.menu_categories
  for each row execute function public.set_updated_at();
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();

-- ─── Row Level Security ─────────────────────────────────────────────────
alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;

-- All staff of the restaurant read its menu (waiters need it to take orders).
create policy "members read categories" on public.menu_categories
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
create policy "members read items" on public.menu_items
  for select to authenticated using (public.has_restaurant_role(restaurant_id));

-- Owner + manager manage the menu (role.ts: menu:manage).
create policy "menu managers add categories" on public.menu_categories
  for insert to authenticated
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));
create policy "menu managers change categories" on public.menu_categories
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));
create policy "menu managers add items" on public.menu_items
  for insert to authenticated
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));
create policy "menu managers change items" on public.menu_items
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));

-- ─── Privileges ─────────────────────────────────────────────────────────
-- No DELETE for staff: deleting = setting deleted_at. id / restaurant_id / created_at can't be
-- updated at all (column grants), so a row can never be moved to another restaurant.
-- anon gets nothing; the customer menu will get its own public read path (Phase 4).
revoke all on public.menu_categories, public.menu_items from anon;
grant select, insert on public.menu_categories, public.menu_items to authenticated;
grant update (name_en, name_ar, sort_order, is_hidden, deleted_at)
  on public.menu_categories to authenticated;
grant update (category_id, name_en, name_ar, description_en, description_ar, price_fils,
              sort_order, is_hidden, is_sold_out, deleted_at)
  on public.menu_items to authenticated;
grant all on public.menu_categories, public.menu_items to service_role;
