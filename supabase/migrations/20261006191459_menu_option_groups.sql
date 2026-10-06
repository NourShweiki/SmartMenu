-- Phase 3 step 9: reusable option groups (mirrors src/domain/menu/options.ts).
-- "Size" / "Sauces" are created once and attached to many items.

-- ─── option_groups ──────────────────────────────────────────────────────
create table public.option_groups (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name_en        text not null check (length(trim(name_en)) between 1 and 80),
  name_ar        text not null check (length(trim(name_ar)) between 1 and 80),
  min_select     integer not null default 0 check (min_select between 0 and 20),
  max_select     integer not null default 1 check (max_select between 1 and 20),
  sort_order     integer not null default 0 check (sort_order >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  deleted_at     timestamptz,
  check (min_select <= max_select),
  unique (restaurant_id, id)
);
create index option_groups_restaurant_idx on public.option_groups (restaurant_id, sort_order) where deleted_at is null;

-- ─── options ────────────────────────────────────────────────────────────
create table public.options (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  group_id          uuid not null,
  name_en           text not null check (length(trim(name_en)) between 1 and 80),
  name_ar           text not null check (length(trim(name_ar)) between 1 and 80),
  price_delta_fils  bigint not null default 0 check (price_delta_fils between 0 and 1000000000),
  sort_order        integer not null default 0 check (sort_order >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  deleted_at        timestamptz,
  foreign key (restaurant_id, group_id) references public.option_groups (restaurant_id, id)
);
create index options_restaurant_group_idx on public.options (restaurant_id, group_id, sort_order) where deleted_at is null;

-- ─── item <-> group links ───────────────────────────────────────────────
-- Composite FKs on BOTH sides: a link can never join items and groups of different restaurants.
alter table public.menu_items add constraint menu_items_restaurant_id_id_key unique (restaurant_id, id);

create table public.menu_item_option_groups (
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  item_id        uuid not null,
  group_id       uuid not null,
  sort_order     integer not null default 0 check (sort_order >= 0),
  created_at     timestamptz not null default now(),
  primary key (item_id, group_id),
  foreign key (restaurant_id, item_id) references public.menu_items (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, group_id) references public.option_groups (restaurant_id, id) on delete cascade
);
create index menu_item_option_groups_restaurant_idx on public.menu_item_option_groups (restaurant_id, item_id);

create trigger option_groups_updated_at before update on public.option_groups
  for each row execute function public.set_updated_at();
create trigger options_updated_at before update on public.options
  for each row execute function public.set_updated_at();

-- ─── Row Level Security (same pattern as the menu) ──────────────────────
alter table public.option_groups           enable row level security;
alter table public.options                 enable row level security;
alter table public.menu_item_option_groups enable row level security;

create policy "members read option groups" on public.option_groups
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
create policy "members read options" on public.options
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
create policy "members read item option groups" on public.menu_item_option_groups
  for select to authenticated using (public.has_restaurant_role(restaurant_id));

create policy "menu managers add option groups" on public.option_groups
  for insert to authenticated
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));
create policy "menu managers change option groups" on public.option_groups
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));

create policy "menu managers add options" on public.options
  for insert to authenticated
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));
create policy "menu managers change options" on public.options
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));

-- Links hold no history (orders will snapshot option names/prices), so detaching is a real delete.
create policy "menu managers attach groups" on public.menu_item_option_groups
  for insert to authenticated
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));
create policy "menu managers reorder attached groups" on public.menu_item_option_groups
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));
create policy "menu managers detach groups" on public.menu_item_option_groups
  for delete to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));

-- ─── Privileges ─────────────────────────────────────────────────────────
revoke all on public.option_groups, public.options, public.menu_item_option_groups from anon;
grant select, insert on public.option_groups, public.options to authenticated;
grant update (name_en, name_ar, min_select, max_select, sort_order, deleted_at) on public.option_groups to authenticated;
grant update (name_en, name_ar, price_delta_fils, sort_order, deleted_at) on public.options to authenticated;
grant select, insert, delete on public.menu_item_option_groups to authenticated;
grant update (sort_order) on public.menu_item_option_groups to authenticated;
grant all on public.option_groups, public.options, public.menu_item_option_groups to service_role;
