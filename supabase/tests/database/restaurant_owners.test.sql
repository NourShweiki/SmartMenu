-- list_restaurant_owners: owners' emails, for founders, through the server only.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('d0d0d0d0-0000-4000-8000-0000000000f1', 'ro-founder@test.local'),
  ('d0d0d0d0-0000-4000-8000-0000000000a1', 'ro-owner-a@test.local'),
  ('d0d0d0d0-0000-4000-8000-0000000000a2', 'ro-second-owner-a@test.local'),
  ('d0d0d0d0-0000-4000-8000-0000000000a3', 'ro-waiter-a@test.local'),
  ('d0d0d0d0-0000-4000-8000-0000000000b1', 'ro-owner-b@test.local');
insert into public.platform_admins (user_id) values ('d0d0d0d0-0000-4000-8000-0000000000f1');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('d0d0d0d0-1111-4000-8000-00000000000a', 'ro-a', 'RO A', 'أ'),
  ('d0d0d0d0-1111-4000-8000-00000000000b', 'ro-b', 'RO B', 'ب');
insert into public.restaurant_members (restaurant_id, user_id, role, created_at) values
  ('d0d0d0d0-1111-4000-8000-00000000000a', 'd0d0d0d0-0000-4000-8000-0000000000a1', 'OWNER',  '2026-10-12T08:00:00Z'),
  ('d0d0d0d0-1111-4000-8000-00000000000a', 'd0d0d0d0-0000-4000-8000-0000000000a2', 'OWNER',  '2026-10-12T09:00:00Z'),
  ('d0d0d0d0-1111-4000-8000-00000000000a', 'd0d0d0d0-0000-4000-8000-0000000000a3', 'WAITER', '2026-10-12T08:30:00Z'),
  ('d0d0d0d0-1111-4000-8000-00000000000b', 'd0d0d0d0-0000-4000-8000-0000000000b1', 'OWNER',  '2026-10-12T08:00:00Z');

-- ── Privileges ──
select function_privs_are('public', 'list_restaurant_owners', array['uuid', 'uuid'], 'anon', array[]::text[], 'anon cannot call list_restaurant_owners');
select function_privs_are('public', 'list_restaurant_owners', array['uuid', 'uuid'], 'authenticated', array[]::text[], 'signed-in users cannot call it');
select function_privs_are('public', 'list_restaurant_owners', array['uuid', 'uuid'], 'service_role', array['EXECUTE'], 'the server can call it');

-- Even the founder, through the public API, cannot call it or read emails any other way.
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0d0d0d0-0000-4000-8000-0000000000f1","role":"authenticated"}';
select throws_ok($$ select * from public.list_restaurant_owners('d0d0d0d0-0000-4000-8000-0000000000f1') $$,
  '42501', null, 'a founder cannot call it directly: only the server can');
select throws_ok($$ select email from auth.users $$, '42501', null, 'and cannot read account emails directly');
reset role;
set local request.jwt.claims = '';

-- ── The function itself (called as the server would) ──
select throws_ok($$ select * from public.list_restaurant_owners('d0d0d0d0-0000-4000-8000-0000000000a1') $$,
  '42501', 'only a platform admin can list restaurant owners', 'an actor who is not a founder is refused (an owner too)');
select throws_ok($$ select * from public.list_restaurant_owners(null) $$,
  '42501', 'only a platform admin can list restaurant owners', 'no actor is refused');

select results_eq(
  $$ select user_id, email from public.list_restaurant_owners('d0d0d0d0-0000-4000-8000-0000000000f1', 'd0d0d0d0-1111-4000-8000-00000000000a') $$,
  $$ values ('d0d0d0d0-0000-4000-8000-0000000000a1'::uuid, 'ro-owner-a@test.local'),
            ('d0d0d0d0-0000-4000-8000-0000000000a2'::uuid, 'ro-second-owner-a@test.local') $$,
  'one restaurant: its owners in the order they joined, with their emails, and not its waiter');
select results_eq(
  $$ select restaurant_id, email from public.list_restaurant_owners('d0d0d0d0-0000-4000-8000-0000000000f1', 'd0d0d0d0-1111-4000-8000-00000000000b') $$,
  $$ values ('d0d0d0d0-1111-4000-8000-00000000000b'::uuid, 'ro-owner-b@test.local') $$,
  'another restaurant: only its own owner');
select is(
  (select count(*) from public.list_restaurant_owners('d0d0d0d0-0000-4000-8000-0000000000f1') o where o.restaurant_id::text like 'd0d0d0d0-1111-%'),
  3::bigint, 'all restaurants: every owner once');
select is_empty(
  $$ select 1 from public.list_restaurant_owners('d0d0d0d0-0000-4000-8000-0000000000f1', 'd0d0d0d0-1111-4000-8000-0000000000ff') $$,
  'an unknown restaurant has no owners');

select * from finish();
rollback;
