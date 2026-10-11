-- platform_admins + create_restaurant: only a founder, only through the server, and all or nothing.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('c0c0c0c0-0000-4000-8000-0000000000f1', 'cr-founder-1@test.local'),
  ('c0c0c0c0-0000-4000-8000-0000000000f2', 'cr-founder-2@test.local'),
  ('c0c0c0c0-0000-4000-8000-0000000000a1', 'cr-owner@test.local'),
  ('c0c0c0c0-0000-4000-8000-0000000000b1', 'cr-somebody@test.local');
insert into public.platform_admins (user_id) values
  ('c0c0c0c0-0000-4000-8000-0000000000f1'), ('c0c0c0c0-0000-4000-8000-0000000000f2');

create function pg_temp.payload(p_id uuid, p_slug text) returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'slug', p_slug, 'name_en', '  New Place ', 'name_ar', ' مكان جديد ',
    'settings', jsonb_build_object(
      'dine_in_enabled', true, 'takeout_enabled', true, 'delivery_enabled', false,
      'tax_rate_bp', 1600, 'service_charge_bp', 1000, 'default_language', 'ar'))
$$;

-- ── Privileges ──
select table_privs_are('public', 'platform_admins', 'anon', array[]::text[], 'anon has no privileges on platform_admins');
select table_privs_are('public', 'platform_admins', 'authenticated', array['SELECT'], 'platform_admins: read only (own row, by policy)');
select function_privs_are('public', 'create_restaurant', array['uuid', 'jsonb', 'uuid'], 'anon', array[]::text[], 'anon cannot call create_restaurant');
select function_privs_are('public', 'create_restaurant', array['uuid', 'jsonb', 'uuid'], 'authenticated', array[]::text[], 'signed-in users cannot call create_restaurant');
select function_privs_are('public', 'create_restaurant', array['uuid', 'jsonb', 'uuid'], 'service_role', array['EXECUTE'], 'the server can call create_restaurant');

-- ── A founder, signed in through the public API ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0c0c0c0-0000-4000-8000-0000000000f1","role":"authenticated"}';

select results_eq('select user_id from public.platform_admins', array['c0c0c0c0-0000-4000-8000-0000000000f1'::uuid],
  'a founder sees their own row and not the other founder''s');
select throws_ok($$ insert into public.platform_admins (user_id) values ('c0c0c0c0-0000-4000-8000-0000000000b1') $$,
  '42501', null, 'a founder cannot make somebody else a founder');
select throws_ok($$ delete from public.platform_admins $$, '42501', null, 'a founder cannot remove founders');
select throws_ok($$ select public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000f1', pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000001', 'cr-direct'), 'c0c0c0c0-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'even a founder cannot call create_restaurant directly: only the server can');
select is_empty('select 1 from public.restaurants', 'being a founder gives no access to any restaurant''s data');

-- ── Somebody who is not a founder ──
set local request.jwt.claims = '{"sub":"c0c0c0c0-0000-4000-8000-0000000000b1","role":"authenticated"}';
select is_empty('select 1 from public.platform_admins', 'other users see no founders');

reset role;
set local request.jwt.claims = '';
set local role anon;
select throws_ok('select 1 from public.platform_admins', '42501', null, 'anon cannot read platform_admins');
reset role;

-- ── The function itself (called as the server would) ──
select throws_ok($$ select public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000b1', pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000001', 'cr-new'), 'c0c0c0c0-0000-4000-8000-0000000000a1') $$,
  '42501', 'only a platform admin can create a restaurant', 'an actor who is not a founder is refused');
select throws_ok($$ select public.create_restaurant(null, pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000001', 'cr-new'), 'c0c0c0c0-0000-4000-8000-0000000000a1') $$,
  '42501', 'only a platform admin can create a restaurant', 'no actor is refused');
select is((select count(*) from public.restaurants where slug = 'cr-new'), 0::bigint, 'a refused call stores nothing');

select is(
  public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000f1', pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000001', 'cr-new'), 'c0c0c0c0-0000-4000-8000-0000000000a1'),
  'c0c0c0c0-1111-4000-8000-000000000001'::uuid, 'a founder creates a restaurant and gets its id back');
select results_eq(
  $$ select slug, name_en, name_ar from public.restaurants where id = 'c0c0c0c0-1111-4000-8000-000000000001' $$,
  $$ values ('cr-new', 'New Place', 'مكان جديد') $$, 'the restaurant is stored, names tidied');
select results_eq(
  $$ select dine_in_enabled, takeout_enabled, delivery_enabled, tax_rate_bp, service_charge_bp, default_language
     from public.restaurant_settings where restaurant_id = 'c0c0c0c0-1111-4000-8000-000000000001' $$,
  $$ values (true, true, false, 1600, 1000, 'ar') $$, 'its settings are stored as given');
select results_eq(
  $$ select user_id, role::text from public.restaurant_members where restaurant_id = 'c0c0c0c0-1111-4000-8000-000000000001' $$,
  $$ values ('c0c0c0c0-0000-4000-8000-0000000000a1'::uuid, 'OWNER') $$, 'the owner is its only member (the founder is not one)');

-- All or nothing: each failure below leaves no trace of the restaurant it tried to create.
select throws_ok($$ select public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000f1', pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000002', 'cr-new'), 'c0c0c0c0-0000-4000-8000-0000000000a1') $$,
  '23505', null, 'a slug that is taken is refused');
select throws_ok($$ select public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000f1', pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000003', 'cr-orphan'), 'c0c0c0c0-0000-4000-8000-00000000dead') $$,
  '23503', null, 'an owner account that does not exist is refused');
select throws_ok($$ select public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000f1', pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000004', 'Bad Slug'), 'c0c0c0c0-0000-4000-8000-0000000000a1') $$,
  '23514', null, 'a slug that cannot be a subdomain is refused');
select throws_ok($$ select public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000f1',
    jsonb_set(pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000005', 'cr-no-mode'), '{settings}', '{"dine_in_enabled":false,"takeout_enabled":false,"delivery_enabled":false,"tax_rate_bp":1600,"service_charge_bp":0,"default_language":"ar"}'),
    'c0c0c0c0-0000-4000-8000-0000000000a1') $$,
  '23514', null, 'a restaurant with no order type switched on is refused');
select throws_ok($$ select public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000f1',
    pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000006', 'cr-missing') #- '{settings,tax_rate_bp}',
    'c0c0c0c0-0000-4000-8000-0000000000a1') $$,
  '23502', null, 'a missing setting is refused (no silent defaults)');
select throws_ok($$ select public.create_restaurant('c0c0c0c0-0000-4000-8000-0000000000f1',
    jsonb_set(pg_temp.payload('c0c0c0c0-1111-4000-8000-000000000007', 'cr-noname'), '{name_ar}', '"   "'),
    'c0c0c0c0-0000-4000-8000-0000000000a1') $$,
  '23514', null, 'an empty name is refused');
select is(
  (select count(*) from public.restaurants where id::text like 'c0c0c0c0-1111-4000-8000-00000000000%'), 1::bigint,
  'none of the refused attempts left a restaurant behind');
select is(
  (select count(*) from public.restaurant_settings where restaurant_id::text like 'c0c0c0c0-1111-4000-8000-00000000000%')
  + (select count(*) from public.restaurant_members where restaurant_id::text like 'c0c0c0c0-1111-4000-8000-00000000000%'),
  2::bigint, 'nor settings or members (only the one good restaurant has them)');

-- ── The new owner, signed in ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0c0c0c0-0000-4000-8000-0000000000a1","role":"authenticated"}';
select results_eq('select slug from public.restaurants', array['cr-new'], 'the new owner sees their restaurant and no other');
select results_eq('select service_charge_bp from public.restaurant_settings', array[1000], 'and can read its settings');

reset role;
select * from finish();
rollback;
