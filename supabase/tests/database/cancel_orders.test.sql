-- Cancelling orders, and not closing a table session over unfinished orders (migration cancel_orders).
-- Who may cancel what is decided by the DATABASE: these tests act as each role directly on the table, the way a
-- bug in a screen or a hand-made request would. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email) values
  ('cccccccc-0000-4000-8000-0000000000c1', 'cancel-owner@test.local'),
  ('cccccccc-0000-4000-8000-0000000000c2', 'cancel-waiter@test.local'),
  ('cccccccc-0000-4000-8000-0000000000c3', 'cancel-cashier@test.local'),
  ('cccccccc-0000-4000-8000-0000000000c4', 'cancel-manager@test.local'),
  ('dddddddd-0000-4000-8000-0000000000d1', 'cancel-other-owner@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('cccccccc-9a9a-4000-8000-000000000000', 'cancel-a', 'Cancel A', 'إلغاء أ'),
  ('dddddddd-9a9a-4000-8000-000000000000', 'cancel-b', 'Cancel B', 'إلغاء ب');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('cccccccc-9a9a-4000-8000-000000000000', 'cccccccc-0000-4000-8000-0000000000c1', 'OWNER'),
  ('cccccccc-9a9a-4000-8000-000000000000', 'cccccccc-0000-4000-8000-0000000000c2', 'WAITER'),
  ('cccccccc-9a9a-4000-8000-000000000000', 'cccccccc-0000-4000-8000-0000000000c3', 'CASHIER'),
  ('cccccccc-9a9a-4000-8000-000000000000', 'cccccccc-0000-4000-8000-0000000000c4', 'MANAGER'),
  ('dddddddd-9a9a-4000-8000-000000000000', 'dddddddd-0000-4000-8000-0000000000d1', 'OWNER');

-- Two tables with a visit each. The second visit will be made to look 3 hours old (past the 2-hour limit).
insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('cccccccc-9b9b-4000-8000-000000000001', 'cccccccc-9a9a-4000-8000-000000000000', '1', 'cancel-test-token-000000000001'),
  ('cccccccc-9b9b-4000-8000-000000000002', 'cccccccc-9a9a-4000-8000-000000000000', '2', 'cancel-test-token-000000000002');
insert into public.table_sessions (id, restaurant_id, table_id) values
  ('cccccccc-9c9c-4000-8000-000000000001', 'cccccccc-9a9a-4000-8000-000000000000', 'cccccccc-9b9b-4000-8000-000000000001'),
  ('cccccccc-9c9c-4000-8000-000000000002', 'cccccccc-9a9a-4000-8000-000000000000', 'cccccccc-9b9b-4000-8000-000000000002');

-- Orders of the first visit, one per situation (the last digit of the id is the order number):
--   1 NEW, 2 CONFIRMED, 3 PREPARING, 4 SERVED, 5 COMPLETED, 6 NEW, 7 READY, 9 PREPARING.  Order 8 (NEW) is in the old visit.
create function pg_temp.o(p_n int) returns uuid language sql as $$ select ('cccccccc-9d9d-4000-8000-00000000000' || p_n)::uuid $$;
insert into public.orders (id, restaurant_id, session_id, number, status, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
select pg_temp.o(n), 'cccccccc-9a9a-4000-8000-000000000000',
       case when n = 8 then 'cccccccc-9c9c-4000-8000-000000000002' else 'cccccccc-9c9c-4000-8000-000000000001' end::uuid,
       n, s::public.order_status, 1000, 0, 160, 1160, 1600, 0
from (values (1, 'NEW'), (2, 'CONFIRMED'), (3, 'PREPARING'), (4, 'SERVED'), (5, 'COMPLETED'), (6, 'NEW'), (7, 'READY'), (8, 'NEW'), (9, 'PREPARING')) as t(n, s);
update public.table_sessions set started_at = now() - interval '3 hours' where id = 'cccccccc-9c9c-4000-8000-000000000002';

create function pg_temp.status_of(p_n int) returns text language sql as $$ select status::text from public.orders where id = pg_temp.o(p_n) $$;

-- ── The table's own guards (apply to everybody, the server included) ──
select throws_ok($$ update public.orders set status = 'CANCELLED' where id = pg_temp.o(1) $$,
  '23514', null, 'an order cannot be cancelled without a reason');
select throws_ok($$ update public.orders set cancel_reason = 'OTHER' where id = pg_temp.o(1) $$,
  '23514', null, 'a reason cannot be written on an order that is not being cancelled');
select throws_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id = pg_temp.o(5) $$,
  '23514', null, 'a COMPLETED order cannot be cancelled');

-- ── Waiter: only before the kitchen starts ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000c2","role":"authenticated"}';
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'GUEST_CHANGED_MIND' where id = pg_temp.o(1) $$,
  'the waiter cancels a NEW order');
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'ITEM_UNAVAILABLE' where id = pg_temp.o(2) $$,
  'the waiter cancels a CONFIRMED order');
select throws_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'MISTAKE' where id = pg_temp.o(3) $$,
  '42501', null, 'the waiter cannot cancel an order the kitchen is PREPARING');
select throws_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'MISTAKE' where id = pg_temp.o(4) $$,
  '42501', null, 'the waiter cannot cancel a SERVED order');
select throws_ok($$ update public.orders set cancelled_by = 'cccccccc-0000-4000-8000-0000000000c1' where id = pg_temp.o(1) $$,
  '42501', null, 'staff cannot write who cancelled (the database stamps it)');
select throws_ok($$ update public.orders set status = 'CONFIRMED' where id = pg_temp.o(1) $$,
  '23514', null, 'a cancelled order cannot go back into the flow');
select throws_ok($$ update public.orders set cancel_reason = 'MISTAKE' where id = pg_temp.o(1) $$,
  '23514', null, 'the reason of a cancellation cannot be changed afterwards');

reset role;
select results_eq(
  $$ select status::text, cancel_reason::text, cancelled_at is not null, cancelled_by from public.orders where id = pg_temp.o(1) $$,
  $$ values ('CANCELLED', 'GUEST_CHANGED_MIND', true, 'cccccccc-0000-4000-8000-0000000000c2'::uuid) $$,
  'a cancellation keeps the reason, and the database stamps when and who');
select is(pg_temp.status_of(3), 'PREPARING', 'the refused cancellation left the order as it was');

-- ── Cashier: never ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000c3","role":"authenticated"}';
select throws_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id = pg_temp.o(6) $$,
  '42501', null, 'the cashier cannot cancel, not even a NEW order');

-- ── Another restaurant's owner: the order is not even there for them ──
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-0000000000d1","role":"authenticated"}';
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id = pg_temp.o(6) $$,
  'another restaurant''s owner "cancelling" it changes no row');
reset role;
select is(pg_temp.status_of(6), 'NEW', '...and the order is untouched');

-- ── Manager and owner: any order that is not completed ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000c4","role":"authenticated"}';
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'MISTAKE' where id = pg_temp.o(3) $$,
  'the manager cancels an order that is PREPARING');
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000c1","role":"authenticated"}';
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id = pg_temp.o(4) $$,
  'the owner cancels a SERVED order');
select throws_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id = pg_temp.o(5) $$,
  '23514', null, 'the owner cannot cancel a COMPLETED order either');
select lives_ok($$ update public.orders set status = 'CONFIRMED' where id = pg_temp.o(6) $$,
  'the normal flow still works: one step forward');
select throws_ok($$ update public.orders set status = 'READY' where id = pg_temp.o(6) $$,
  '23514', null, '...and still only one step at a time');

-- ── A visit is not closed over unfinished orders ──
-- Visit 1 now has: 1-4 CANCELLED, 5 COMPLETED, 6 CONFIRMED, 7 READY, 9 PREPARING.
select throws_ok($$ update public.table_sessions set status = 'CLOSED' where id = 'cccccccc-9c9c-4000-8000-000000000001' $$,
  '23514', null, 'a visit with unfinished orders cannot be closed');
select lives_ok($$ update public.table_sessions set status = 'PAYMENT_REQUESTED' where id = 'cccccccc-9c9c-4000-8000-000000000001' $$,
  '"ready to pay" is allowed while orders are still on their way');
select throws_ok($$ update public.table_sessions set status = 'CLOSED' where id = 'cccccccc-9c9c-4000-8000-000000000001' $$,
  '23514', null, '...but closing still is not');
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id in (pg_temp.o(6), pg_temp.o(7)) $$,
  'the owner cancels two of the three orders that are left');
select throws_ok($$ update public.table_sessions set status = 'CLOSED' where id = 'cccccccc-9c9c-4000-8000-000000000001' $$,
  '23514', null, 'one unfinished order is enough to keep the visit open');

-- The server itself (no signed-in user) may cancel too; nobody is recorded as having done it.
reset role;
set local request.jwt.claims = ''; -- really nobody: `reset role` alone leaves the last user's claims in place
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id = pg_temp.o(9) $$,
  'the server cancels the last unfinished order');
select is((select cancelled_by from public.orders where id = pg_temp.o(9)), null::uuid, '...with nobody stamped as the one who cancelled');

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000c1","role":"authenticated"}';
select lives_ok($$ update public.table_sessions set status = 'CLOSED' where id = 'cccccccc-9c9c-4000-8000-000000000001' $$,
  'with every order completed or cancelled, the visit closes');

-- A visit that ran out of time CAN be closed with an unfinished order in it: the next guests must be able to sit.
select lives_ok($$ update public.table_sessions set status = 'CLOSED' where id = 'cccccccc-9c9c-4000-8000-000000000002' $$,
  'a visit past its 2 hours closes even with an unfinished order');
reset role;
select is(pg_temp.status_of(8), 'NEW', '...and that order is kept as it was (staff see it under "visits that have ended")');
select is((select count(*) from public.table_sessions where restaurant_id = 'cccccccc-9a9a-4000-8000-000000000000' and status = 'CLOSED' and ended_at is not null),
  2::bigint, 'both visits are closed, with their end time stamped');

select * from finish();
rollback;
