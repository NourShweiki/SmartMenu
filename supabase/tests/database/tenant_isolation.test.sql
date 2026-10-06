-- Proves restaurants can't see or change each other's data.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Fixtures (as superuser): two restaurants, an owner of each, a waiter in A.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'owner-b@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'waiter-a@test.local');

insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-1111-4000-8000-000000000000', 'test-a', 'Test A', 'تجربة أ'),
  ('bbbbbbbb-1111-4000-8000-000000000000', 'test-b', 'Test B', 'تجربة ب');
insert into public.restaurant_settings (restaurant_id) values
  ('aaaaaaaa-1111-4000-8000-000000000000'),
  ('bbbbbbbb-1111-4000-8000-000000000000');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-1111-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'OWNER'),
  ('bbbbbbbb-1111-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001', 'OWNER'),
  ('aaaaaaaa-1111-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000002', 'WAITER');

-- ── Act as owner of A ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select results_eq($$ select slug from public.restaurants $$, $$ values ('test-a') $$,
  'owner A sees only restaurant A');
select is((select count(*) from public.restaurant_settings where restaurant_id = 'bbbbbbbb-1111-4000-8000-000000000000'), 0::bigint,
  'owner A cannot read B settings');
select is((select count(*) from public.restaurant_members where restaurant_id = 'bbbbbbbb-1111-4000-8000-000000000000'), 0::bigint,
  'owner A cannot read B staff');
select is((select count(*) from public.restaurant_members), 2::bigint,
  'owner A sees own 2 staff members');

update public.restaurants set name_en = 'hacked' where id = 'bbbbbbbb-1111-4000-8000-000000000000';
update public.restaurant_settings set tax_rate_bp = 0 where restaurant_id = 'bbbbbbbb-1111-4000-8000-000000000000';

select throws_ok(
  $$ insert into public.restaurant_members (restaurant_id, user_id, role)
     values ('bbbbbbbb-1111-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'OWNER') $$,
  '42501', null, 'owner A cannot add themself to restaurant B');

select lives_ok(
  $$ update public.restaurant_settings set service_charge_bp = 500 where restaurant_id = 'aaaaaaaa-1111-4000-8000-000000000000' $$,
  'owner A can update own settings');

-- ── Act as waiter of A ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}';

update public.restaurant_settings set tax_rate_bp = 0 where restaurant_id = 'aaaaaaaa-1111-4000-8000-000000000000';

select throws_ok(
  $$ insert into public.restaurant_members (restaurant_id, user_id, role)
     values ('aaaaaaaa-1111-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001', 'MANAGER') $$,
  '42501', null, 'waiter cannot add staff');

-- ── Act as anonymous visitor ──
reset role;
set local role anon;
select throws_ok($$ select * from public.restaurants $$, '42501', null, 'anon has no direct table access');

-- ── Verify as superuser that blocked writes changed nothing ──
reset role;
select is((select name_en from public.restaurants where slug = 'test-b'), 'Test B', 'B name unchanged by A');
select is((select tax_rate_bp from public.restaurant_settings where restaurant_id = 'bbbbbbbb-1111-4000-8000-000000000000'), 1600,
  'B tax unchanged by A');
select is((select tax_rate_bp from public.restaurant_settings where restaurant_id = 'aaaaaaaa-1111-4000-8000-000000000000'), 1600,
  'waiter cannot change settings');
select is((select service_charge_bp from public.restaurant_settings where restaurant_id = 'aaaaaaaa-1111-4000-8000-000000000000'), 500,
  'owner change to own settings was saved');

select * from finish();
rollback;
