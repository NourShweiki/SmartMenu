-- Pin the table privileges to exactly what the app needs, whatever the platform's defaults are.
--
-- Found 2026-10-10 by the pgTAP test "staff cannot hard-delete": with the current Supabase images,
-- default privileges in `public` give anon / authenticated / service_role ALL on every new table
-- (DELETE, TRUNCATE, every column ...). The earlier migrations assumed the opposite and only revoked
-- from `anon`, so `authenticated` quietly held more than the migrations intended. RLS still stopped
-- cross-restaurant reads and writes, but the second line of defence (no DELETE, column-level UPDATE
-- grants such as "restaurant_id can never change") was not in force.
--
-- This migration is idempotent and re-states every intended grant, so the result is the same on any
-- Supabase version. Orders (20261010120000_orders.sql) already pins its own tables.

-- 1. Future tables and functions: stop handing anon / authenticated everything by default (each migration grants
--    what it needs; a SECURITY DEFINER function a migration forgets to revoke would otherwise be callable by anyone).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

-- 2. Existing tables: clear, then grant back only what the original migrations intended.
revoke all on public.restaurants, public.restaurant_settings, public.restaurant_members,
              public.menu_categories, public.menu_items,
              public.option_groups, public.options, public.menu_item_option_groups
  from anon, authenticated;

-- restaurants / settings / members (20261006000100_grant_table_privileges.sql), now column-level where the
-- original was table-level: an owner may rename the restaurant but never change its id or slug (the slug is the
-- subdomain QR codes point at, spec §5), settings never move to another restaurant, and a member row can only
-- have its role changed (not re-pointed at another restaurant or user).
grant select on public.restaurants, public.restaurant_settings to authenticated;
grant update (name_en, name_ar) on public.restaurants to authenticated;
grant update (dine_in_enabled, takeout_enabled, delivery_enabled, tax_rate_bp, service_charge_bp, default_language, branding)
  on public.restaurant_settings to authenticated;
grant select, insert, delete on public.restaurant_members to authenticated;
grant update (role) on public.restaurant_members to authenticated;

-- menu (20261006180045 + 20261006185818): no DELETE for staff (soft delete), no change to id / restaurant_id.
grant select, insert on public.menu_categories, public.menu_items to authenticated;
grant update (name_en, name_ar, sort_order, is_hidden, deleted_at) on public.menu_categories to authenticated;
grant update (category_id, name_en, name_ar, description_en, description_ar, price_fils,
              sort_order, is_hidden, is_sold_out, deleted_at, image_path)
  on public.menu_items to authenticated;

-- option groups (20261006191459)
grant select, insert on public.option_groups, public.options to authenticated;
grant update (name_en, name_ar, min_select, max_select, sort_order, deleted_at) on public.option_groups to authenticated;
grant update (name_en, name_ar, price_delta_fils, sort_order, deleted_at) on public.options to authenticated;
grant select, insert, delete on public.menu_item_option_groups to authenticated;
grant update (sort_order) on public.menu_item_option_groups to authenticated;
