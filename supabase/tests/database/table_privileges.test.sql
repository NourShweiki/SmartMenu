-- Pins the table privileges of anon and authenticated, so a change of Supabase defaults (or a migration that
-- forgets to revoke) is caught here. See migration 20261010120100_pin_table_privileges.sql.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ── anon: nothing on any app table ──
select table_privs_are('public', t, 'anon', array[]::text[], 'anon has no privileges on ' || t)
from unnest(array['restaurants', 'restaurant_settings', 'restaurant_members', 'menu_categories', 'menu_items',
                  'option_groups', 'options', 'menu_item_option_groups',
                  'orders', 'order_items', 'order_item_options', 'order_counters']) as t;

-- ── authenticated: exactly what the app needs (column-level UPDATE grants are checked below) ──
select table_privs_are('public', 'restaurants', 'authenticated', array['SELECT'], 'restaurants: read only');
select table_privs_are('public', 'restaurant_settings', 'authenticated', array['SELECT'], 'restaurant_settings: read only');
select table_privs_are('public', 'restaurant_members', 'authenticated', array['SELECT', 'INSERT', 'DELETE'], 'restaurant_members: no table-wide UPDATE');
select table_privs_are('public', 'menu_categories', 'authenticated', array['SELECT', 'INSERT'], 'menu_categories: no DELETE (soft delete)');
select table_privs_are('public', 'menu_items', 'authenticated', array['SELECT', 'INSERT'], 'menu_items: no DELETE (soft delete)');
select table_privs_are('public', 'option_groups', 'authenticated', array['SELECT', 'INSERT'], 'option_groups: no DELETE');
select table_privs_are('public', 'options', 'authenticated', array['SELECT', 'INSERT'], 'options: no DELETE');
select table_privs_are('public', 'menu_item_option_groups', 'authenticated', array['SELECT', 'INSERT', 'DELETE'], 'item option links: attach / detach');
select table_privs_are('public', 'orders', 'authenticated', array['SELECT'], 'orders: read only (status is a column grant)');
select table_privs_are('public', 'order_items', 'authenticated', array['SELECT'], 'order_items: read only');
select table_privs_are('public', 'order_item_options', 'authenticated', array['SELECT'], 'order_item_options: read only');
select table_privs_are('public', 'order_counters', 'authenticated', array[]::text[], 'order_counters: no access at all');

-- ── Who may change which column of the original tables ──
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-0000000000f1', 'priv-owner@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-6666-4000-8000-000000000000', 'priv-a', 'Priv A', 'صلاحيات أ');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-6666-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'OWNER');
insert into public.restaurant_settings (restaurant_id) values ('aaaaaaaa-6666-4000-8000-000000000000');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f1","role":"authenticated"}';

select lives_ok($$ update public.restaurants set name_en = 'Renamed' where id = 'aaaaaaaa-6666-4000-8000-000000000000' $$,
  'owner can rename the restaurant');
select throws_ok($$ update public.restaurants set slug = 'new-slug' where id = 'aaaaaaaa-6666-4000-8000-000000000000' $$,
  '42501', null, 'owner cannot change the slug (the subdomain QR codes point at)');
select throws_ok($$ update public.restaurants set id = gen_random_uuid() where id = 'aaaaaaaa-6666-4000-8000-000000000000' $$,
  '42501', null, 'owner cannot change the restaurant id');
select lives_ok($$ update public.restaurant_settings set tax_rate_bp = 1000 where restaurant_id = 'aaaaaaaa-6666-4000-8000-000000000000' $$,
  'owner can change settings');
select throws_ok($$ update public.restaurant_settings set restaurant_id = 'bbbbbbbb-6666-4000-8000-000000000000' where restaurant_id = 'aaaaaaaa-6666-4000-8000-000000000000' $$,
  '42501', null, 'settings cannot be moved to another restaurant');
select lives_ok($$ update public.restaurant_members set role = 'MANAGER' where user_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
  'a member role can be changed');
select throws_ok($$ update public.restaurant_members set restaurant_id = 'bbbbbbbb-6666-4000-8000-000000000000' $$,
  '42501', null, 'a member row cannot be moved to another restaurant');
select throws_ok($$ update public.restaurant_members set user_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
  '42501', null, 'a member row cannot be re-pointed at another user');

reset role;

-- ── Functions: nothing is callable by anon unless a migration says so ──
select ok(not has_function_privilege('anon', 'public.next_order_number(uuid)', 'execute'), 'anon cannot call next_order_number');
select ok(not has_function_privilege('authenticated', 'public.next_order_number(uuid)', 'execute'), 'staff cannot call next_order_number');
select ok(has_function_privilege('service_role', 'public.next_order_number(uuid)', 'execute'), 'service_role can call next_order_number');
select ok(not has_function_privilege('anon', 'public.has_restaurant_role(uuid, public.app_role[])', 'execute'), 'anon cannot call has_restaurant_role');
select ok(has_function_privilege('anon', 'public.get_public_restaurant(text)', 'execute'), 'anon can call get_public_restaurant (the public read path)');

select * from finish();
rollback;
