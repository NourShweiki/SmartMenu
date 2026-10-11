-- Staff management: the staff list with emails, the two server-only account checks, and the two rules of the
-- membership guard (nobody acts on themselves; a restaurant keeps an owner).
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users (id, email) values
  ('e0e0e0e0-0000-4000-8000-0000000000a1', 'sm-owner-a@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000a2', 'sm-manager-a@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000a3', 'sm-waiter-a@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000a4', 'sm-cashier-a@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000a5', 'sm-second-owner-a@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000b1', 'sm-owner-b@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000b2', 'sm-waiter-b@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000c1', 'SM-Former@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000c2', 'sm-both@test.local'),
  ('e0e0e0e0-0000-4000-8000-0000000000f1', 'sm-founder@test.local');
insert into public.platform_admins (user_id) values ('e0e0e0e0-0000-4000-8000-0000000000f1');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('e0e0e0e0-1111-4000-8000-00000000000a', 'sm-a', 'SM A', 'أ'),
  ('e0e0e0e0-1111-4000-8000-00000000000b', 'sm-b', 'SM B', 'ب');
insert into public.restaurant_members (restaurant_id, user_id, role, created_at) values
  ('e0e0e0e0-1111-4000-8000-00000000000a', 'e0e0e0e0-0000-4000-8000-0000000000a3', 'WAITER',  '2026-10-12T08:10:00Z'),
  ('e0e0e0e0-1111-4000-8000-00000000000a', 'e0e0e0e0-0000-4000-8000-0000000000a1', 'OWNER',   '2026-10-12T08:00:00Z'),
  ('e0e0e0e0-1111-4000-8000-00000000000a', 'e0e0e0e0-0000-4000-8000-0000000000a4', 'CASHIER', '2026-10-12T08:20:00Z'),
  ('e0e0e0e0-1111-4000-8000-00000000000a', 'e0e0e0e0-0000-4000-8000-0000000000a2', 'MANAGER', '2026-10-12T08:05:00Z'),
  ('e0e0e0e0-1111-4000-8000-00000000000a', 'e0e0e0e0-0000-4000-8000-0000000000c2', 'WAITER',  '2026-10-12T08:30:00Z'),
  ('e0e0e0e0-1111-4000-8000-00000000000b', 'e0e0e0e0-0000-4000-8000-0000000000b1', 'OWNER',   '2026-10-12T08:00:00Z'),
  ('e0e0e0e0-1111-4000-8000-00000000000b', 'e0e0e0e0-0000-4000-8000-0000000000b2', 'WAITER',  '2026-10-12T08:10:00Z'),
  ('e0e0e0e0-1111-4000-8000-00000000000b', 'e0e0e0e0-0000-4000-8000-0000000000c2', 'CASHIER', '2026-10-12T08:20:00Z');

-- Short names for the ids used over and over below.
create function pg_temp.a() returns uuid language sql immutable as $$ select 'e0e0e0e0-1111-4000-8000-00000000000a'::uuid $$;
create function pg_temp.b() returns uuid language sql immutable as $$ select 'e0e0e0e0-1111-4000-8000-00000000000b'::uuid $$;
create function pg_temp.u(p_tail text) returns uuid language sql immutable as $$ select ('e0e0e0e0-0000-4000-8000-0000000000' || p_tail)::uuid $$;
grant execute on function pg_temp.a(), pg_temp.b(), pg_temp.u(text) to authenticated, anon;

-- ── Privileges ──
select function_privs_are('public', 'list_restaurant_staff', array['uuid'], 'anon', array[]::text[], 'anon cannot call list_restaurant_staff');
select function_privs_are('public', 'list_restaurant_staff', array['uuid'], 'authenticated', array['EXECUTE'], 'signed-in staff can call it (it checks their role itself)');
select function_privs_are('public', 'find_unattached_account', array['uuid', 'uuid', 'text'], 'authenticated', array[]::text[], 'find_unattached_account: server only');
select function_privs_are('public', 'is_resettable_staff_account', array['uuid', 'uuid', 'uuid'], 'authenticated', array[]::text[], 'is_resettable_staff_account: server only');
select function_privs_are('public', 'assert_staff_manager', array['uuid', 'uuid'], 'authenticated', array[]::text[], 'assert_staff_manager: server only');
select function_privs_are('public', 'find_unattached_account', array['uuid', 'uuid', 'text'], 'anon', array[]::text[], 'find_unattached_account: not for anon');

-- ── The staff list ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"e0e0e0e0-0000-4000-8000-0000000000a1","role":"authenticated"}';
select results_eq(
  $$ select role::text, email from public.list_restaurant_staff(pg_temp.a()) $$,
  $$ values ('OWNER', 'sm-owner-a@test.local'), ('MANAGER', 'sm-manager-a@test.local'), ('WAITER', 'sm-waiter-a@test.local'),
            ('WAITER', 'sm-both@test.local'), ('CASHIER', 'sm-cashier-a@test.local') $$,
  'the owner sees the restaurant''s staff with emails: by role, then in the order they joined');
select throws_ok($$ select * from public.list_restaurant_staff(pg_temp.b()) $$, '42501', null, 'not another restaurant''s staff');
select throws_ok($$ select email from auth.users $$, '42501', null, 'and account emails cannot be read any other way');

set local request.jwt.claims = '{"sub":"e0e0e0e0-0000-4000-8000-0000000000a2","role":"authenticated"}';
select is((select count(*) from public.list_restaurant_staff(pg_temp.a())), 5::bigint, 'a manager sees the list too');
set local request.jwt.claims = '{"sub":"e0e0e0e0-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$ select * from public.list_restaurant_staff(pg_temp.a()) $$, '42501', null, 'a waiter does not');
set local request.jwt.claims = '{"sub":"e0e0e0e0-0000-4000-8000-0000000000f1","role":"authenticated"}';
select throws_ok($$ select * from public.list_restaurant_staff(pg_temp.a()) $$, '42501', null, 'nor a founder (not staff of the restaurant)');

-- ── Nobody changes or removes themselves; managers act on staff below owners ──
set local request.jwt.claims = '{"sub":"e0e0e0e0-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$ update public.restaurant_members set role = 'MANAGER' where user_id = pg_temp.u('a1') $$,
  '42501', 'staff cannot change or remove their own membership', 'an owner cannot change their own role');
select throws_ok($$ delete from public.restaurant_members where user_id = pg_temp.u('a1') $$,
  '42501', 'staff cannot change or remove their own membership', 'or remove themselves');

set local request.jwt.claims = '{"sub":"e0e0e0e0-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok($$ delete from public.restaurant_members where user_id = pg_temp.u('a2') and restaurant_id = pg_temp.a() $$,
  '42501', null, 'a manager cannot remove themselves either');
select lives_ok($$ update public.restaurant_members set role = 'CASHIER' where user_id = pg_temp.u('a3') and restaurant_id = pg_temp.a() $$,
  'a manager changes a waiter''s role');
select lives_ok($$ delete from public.restaurant_members where user_id = pg_temp.u('a3') and restaurant_id = pg_temp.a() $$,
  'and removes them');
-- The owner's row is not the manager's to touch: the delete finds nothing to delete, the promotion is refused.
delete from public.restaurant_members where user_id = pg_temp.u('a1') and restaurant_id = pg_temp.a();
select throws_ok($$ update public.restaurant_members set role = 'OWNER' where user_id = pg_temp.u('a4') and restaurant_id = pg_temp.a() $$,
  '42501', null, 'a manager cannot make somebody an owner');
reset role;
set local request.jwt.claims = '';
select is((select count(*) from public.restaurant_members where restaurant_id = pg_temp.a() and user_id = pg_temp.u('a3')), 0::bigint, 'the waiter is gone');
select is((select role::text from public.restaurant_members where restaurant_id = pg_temp.a() and user_id = pg_temp.u('a1')), 'OWNER', 'a manager cannot remove the owner');
select is((select role::text from public.restaurant_members where restaurant_id = pg_temp.a() and user_id = pg_temp.u('a4')), 'CASHIER', 'and the cashier is still a cashier');
select is((select count(*) from auth.users where id = pg_temp.u('a3')), 1::bigint, 'the removed waiter''s account is still there');

-- ── A restaurant keeps an owner (whoever asks, the server included) ──
select throws_ok($$ delete from public.restaurant_members where restaurant_id = pg_temp.b() and user_id = pg_temp.u('b1') $$,
  '23514', 'a restaurant must keep at least one owner', 'the only owner cannot be removed');
select throws_ok($$ update public.restaurant_members set role = 'MANAGER' where restaurant_id = pg_temp.b() and user_id = pg_temp.u('b1') $$,
  '23514', 'a restaurant must keep at least one owner', 'or demoted');
select throws_ok($$ delete from auth.users where id = pg_temp.u('b1') $$,
  '23514', null, 'nor can their account be deleted from under the restaurant');
insert into public.restaurant_members (restaurant_id, user_id, role) values (pg_temp.a(), pg_temp.u('a5'), 'OWNER');
set local role authenticated;
set local request.jwt.claims = '{"sub":"e0e0e0e0-0000-4000-8000-0000000000a5","role":"authenticated"}';
select lives_ok($$ update public.restaurant_members set role = 'MANAGER' where restaurant_id = pg_temp.a() and user_id = pg_temp.u('a1') $$,
  'with two owners, one can demote the other');
reset role;
set local request.jwt.claims = '';
select throws_ok($$ delete from public.restaurant_members where restaurant_id = pg_temp.a() and user_id = pg_temp.u('a5') $$,
  '23514', null, 'who is then the only owner, and stays');
update public.restaurant_members set role = 'OWNER' where restaurant_id = pg_temp.a() and user_id = pg_temp.u('a1');

-- ── find_unattached_account (called as the server would) ──
select is(public.find_unattached_account(pg_temp.u('a1'), pg_temp.a(), 'sm-former@test.local'), pg_temp.u('c1'),
  'an account that belongs to no restaurant can be taken on (letter case of the email does not matter)');
select is(public.find_unattached_account(pg_temp.u('a2'), pg_temp.a(), '  SM-FORMER@test.local '), pg_temp.u('c1'), 'a manager may ask too; spaces around the email do not matter');
select is(public.find_unattached_account(pg_temp.u('a1'), pg_temp.a(), 'sm-waiter-a@test.local'), pg_temp.u('a3'), 'somebody who was removed is unattached again');
select is(public.find_unattached_account(pg_temp.u('a1'), pg_temp.a(), 'sm-waiter-b@test.local'), null, 'an account that works at another restaurant is not offered');
select is(public.find_unattached_account(pg_temp.u('a1'), pg_temp.a(), 'sm-founder@test.local'), null, 'nor a founder''s account');
select is(public.find_unattached_account(pg_temp.u('a1'), pg_temp.a(), 'nobody@test.local'), null, 'nor an email without an account');
select throws_ok($$ select public.find_unattached_account(pg_temp.u('a4'), pg_temp.a(), 'sm-former@test.local') $$,
  '42501', null, 'a cashier acting is refused');
select throws_ok($$ select public.find_unattached_account(pg_temp.u('a1'), pg_temp.b(), 'sm-former@test.local') $$,
  '42501', null, 'an owner acting for another restaurant is refused');
select throws_ok($$ select public.find_unattached_account(null, pg_temp.a(), 'sm-former@test.local') $$,
  '42501', null, 'no actor is refused');

-- ── is_resettable_staff_account ──
select is(public.is_resettable_staff_account(pg_temp.u('a1'), pg_temp.a(), pg_temp.u('a4')), true, 'the owner may reset a cashier of the restaurant');
select is(public.is_resettable_staff_account(pg_temp.u('a2'), pg_temp.a(), pg_temp.u('a1')), false, 'a manager may not reset an owner');
select is(public.is_resettable_staff_account(pg_temp.u('a1'), pg_temp.a(), pg_temp.u('c2')), false, 'not somebody who also works at another restaurant');
select is(public.is_resettable_staff_account(pg_temp.u('a1'), pg_temp.a(), pg_temp.u('b2')), false, 'not another restaurant''s staff');
select is(public.is_resettable_staff_account(pg_temp.u('a2'), pg_temp.a(), pg_temp.u('a2')), false, 'not oneself (that is "change my password")');
select throws_ok($$ select public.is_resettable_staff_account(pg_temp.u('a4'), pg_temp.a(), pg_temp.u('a2')) $$,
  '42501', null, 'a cashier acting is refused');

select * from finish();
rollback;
