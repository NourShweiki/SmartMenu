-- Takeout: pickup visits (a session without a table), starting one with its first order, who moves a pickup order,
-- and the visit ending with its last order.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

create function pg_temp.a() returns uuid language sql immutable as $$ select 'a7a7a7a7-1111-4000-8000-00000000000a'::uuid $$;
create function pg_temp.b() returns uuid language sql immutable as $$ select 'a7a7a7a7-1111-4000-8000-00000000000b'::uuid $$;
create function pg_temp.u(p_n int) returns uuid language sql immutable as $$ select ('a7a7a7a7-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create function pg_temp.s(p_n int) returns uuid language sql immutable as $$ select ('a7a7a7a7-5555-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create function pg_temp.o(p_n int) returns uuid language sql immutable as $$ select ('a7a7a7a7-6666-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
grant execute on function pg_temp.a(), pg_temp.b(), pg_temp.u(int), pg_temp.s(int), pg_temp.o(int) to authenticated, anon;

insert into auth.users (id, email) values
  (pg_temp.u(1), 'tp-owner-a@test.local'), (pg_temp.u(2), 'tp-waiter-a@test.local'),
  (pg_temp.u(3), 'tp-cashier-a@test.local'), (pg_temp.u(4), 'tp-owner-b@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values (pg_temp.a(), 'tp-a', 'TP A', 'أ'), (pg_temp.b(), 'tp-b', 'TP B', 'ب');
insert into public.restaurant_settings (restaurant_id, dine_in_enabled, takeout_enabled) values (pg_temp.a(), true, true), (pg_temp.b(), true, false);
insert into public.restaurant_members (restaurant_id, user_id, role) values
  (pg_temp.a(), pg_temp.u(1), 'OWNER'), (pg_temp.a(), pg_temp.u(2), 'WAITER'), (pg_temp.a(), pg_temp.u(3), 'CASHIER'),
  (pg_temp.b(), pg_temp.u(4), 'OWNER');
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values
  ('a7a7a7a7-2222-4000-8000-00000000000a', pg_temp.a(), 'A', 'أ'), ('a7a7a7a7-2222-4000-8000-00000000000b', pg_temp.b(), 'B', 'ب');
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('a7a7a7a7-3333-4000-8000-00000000000a', pg_temp.a(), 'a7a7a7a7-2222-4000-8000-00000000000a', 'Coffee', 'قهوة', 2500),
  ('a7a7a7a7-3333-4000-8000-00000000000b', pg_temp.b(), 'a7a7a7a7-2222-4000-8000-00000000000b', 'Tea', 'شاي', 2500);
-- A table with an OPEN visit at restaurant A, and one order in it.
insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('a7a7a7a7-4444-4000-8000-000000000001', pg_temp.a(), '1', 'takeout-pickup-test-token-0001');
insert into public.table_sessions (id, restaurant_id, table_id) values (pg_temp.s(90), pg_temp.a(), 'a7a7a7a7-4444-4000-8000-000000000001');

-- One line of 2.500, no service charge (takeout), tax 16% = 0.400, total 2.900. Order and line ids come from p_n.
create function pg_temp.payload(p_n int, p_session uuid, p_key uuid, p_pickup jsonb default null, p_restaurant uuid default pg_temp.a(), p_total bigint default 2900)
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', pg_temp.o(p_n), 'restaurant_id', p_restaurant, 'session_id', p_session, 'number', p_n, 'client_request_id', p_key,
    'tax_rate_bp', 1600, 'service_charge_bp', 0,
    'subtotal_fils', 2500, 'service_charge_fils', 0, 'tax_fils', 400, 'total_fils', p_total,
    'created_at', now(),
    'pickup', p_pickup,
    'items', jsonb_build_array(jsonb_build_object(
      'id', ('a7a7a7a7-7777-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid,
      'menu_item_id', case when p_restaurant = pg_temp.a() then 'a7a7a7a7-3333-4000-8000-00000000000a' else 'a7a7a7a7-3333-4000-8000-00000000000b' end,
      'name_en', 'Coffee', 'name_ar', 'قهوة', 'unit_price_fils', 2500, 'quantity', 1, 'line_total_fils', 2500, 'options', '[]'::jsonb))));
$$;
create function pg_temp.ali() returns jsonb language sql immutable as $$ select '{"customer_name":"Ali Hasan","customer_phone":"+962791234567"}'::jsonb $$;

-- ── The shape of a session row ──
select throws_ok($$ insert into public.table_sessions (restaurant_id, kind, customer_phone) values (pg_temp.a(), 'PICKUP', '+962791234567') $$,
  '23514', null, 'a pickup visit needs a name');
select throws_ok($$ insert into public.table_sessions (restaurant_id, kind, customer_name, customer_phone) values (pg_temp.a(), 'PICKUP', 'Ali', '0791234567') $$,
  '23514', null, 'and a mobile number in international form');
select throws_ok($$ insert into public.table_sessions (restaurant_id, kind, customer_name, customer_phone) values (pg_temp.a(), 'PICKUP', ' Ali  Hasan', '+962791234567') $$,
  '23514', null, 'the name must be tidy');
select throws_ok($$ insert into public.table_sessions (restaurant_id, kind, table_id, customer_name, customer_phone)
                    values (pg_temp.a(), 'PICKUP', 'a7a7a7a7-4444-4000-8000-000000000001', 'Ali', '+962791234567') $$,
  '23514', null, 'a pickup visit has no table');
select throws_ok($$ insert into public.table_sessions (restaurant_id, table_id, customer_name) values (pg_temp.a(), 'a7a7a7a7-4444-4000-8000-000000000001', 'Ali') $$,
  '23514', null, 'a table visit has no customer');
select throws_ok($$ insert into public.table_sessions (restaurant_id) values (pg_temp.a()) $$,
  '23514', null, 'a table visit needs a table');

-- ── Starting a pickup visit with its first order ──
select is(public.place_order(pg_temp.payload(1, pg_temp.s(1), pg_temp.s(1), pg_temp.ali())), pg_temp.o(1), 'a pickup order is placed');
select results_eq(
  $$ select kind::text, table_id, customer_name, customer_phone, status::text from public.table_sessions where id = pg_temp.s(1) $$,
  $$ values ('PICKUP', null::uuid, 'Ali Hasan', '+962791234567', 'OPEN') $$,
  'its visit was created with it: no table, the customer''s name and number');
-- The same submission again (the reply was lost): a new order id and number, the SAME visit id and key.
select is(public.place_order(pg_temp.payload(2, pg_temp.s(1), pg_temp.s(1), pg_temp.ali())), pg_temp.o(1), 'the same submission again returns the first order');
select is((select count(*) from public.orders where restaurant_id = pg_temp.a() and session_id = pg_temp.s(1)), 1::bigint, 'and stores nothing new');
select is(public.place_order(pg_temp.payload(3, pg_temp.s(1), pg_temp.s(31))), pg_temp.o(3), 'the customer orders again into the open visit (another key, no new visit)');

select throws_ok($$ select public.place_order(pg_temp.payload(4, pg_temp.s(4), pg_temp.s(4), pg_temp.ali(), pg_temp.b())) $$,
  '23514', 'takeout is switched off for this restaurant', 'no pickup order where takeout is switched off');
select throws_ok($$ select public.place_order(pg_temp.payload(5, pg_temp.s(90), pg_temp.s(5), pg_temp.ali())) $$,
  '23514', 'this visit is not a pickup visit of this restaurant', 'a table visit cannot be turned into a pickup visit');
select throws_ok($$ select public.place_order(pg_temp.payload(6, pg_temp.s(6), pg_temp.s(6), '{"customer_name":"Ali","customer_phone":"12345"}')) $$,
  '23514', null, 'a bad number is refused');
select throws_ok($$ select public.place_order(pg_temp.payload(7, pg_temp.s(7), pg_temp.s(7), pg_temp.ali(), pg_temp.a(), 9999)) $$,
  '23514', null, 'an order that is refused (wrong total)...');
select is((select count(*) from public.table_sessions where id in (pg_temp.s(4), pg_temp.s(6), pg_temp.s(7))), 0::bigint,
  '...leaves no visit behind: a pickup visit never exists without an order');

-- ── What the customer's phone learns ──
select is(public.get_public_session('tp-a', pg_temp.s(1)),
  jsonb_build_object('session_id', pg_temp.s(1), 'kind', 'PICKUP', 'table_label', null, 'customer_name', 'Ali Hasan', 'status', 'OPEN'),
  'a pickup visit: its kind and the name, never the phone number');
select is(public.get_public_session('tp-a', pg_temp.s(90)),
  jsonb_build_object('session_id', pg_temp.s(90), 'kind', 'TABLE', 'table_label', '1', 'customer_name', null, 'status', 'OPEN'),
  'a table visit answers as before, plus its kind');
select is(public.get_public_session('tp-b', pg_temp.s(1)), null::jsonb, 'not at another restaurant''s address');
select is(jsonb_array_length(public.get_public_session_orders('tp-a', pg_temp.s(1))), 2, 'the visit''s two orders can be followed');
set local role anon;
select is(public.get_public_session('tp-a', pg_temp.s(1)) ->> 'status', 'OPEN', 'a visitor who is not signed in can look its own visit up');
select throws_ok($$ select customer_phone from public.table_sessions $$, '42501', null, 'but cannot read the visits table');
reset role;

-- ── Staff: who sees the customer, who moves a pickup order ──
select place_order(pg_temp.payload(8, pg_temp.s(90), pg_temp.s(8))); -- an order at the TABLE, to compare with
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7a7a7a7-0000-4000-8000-000000000004","role":"authenticated"}';
select is_empty($$ select 1 from public.table_sessions where id = pg_temp.s(1) $$, 'another restaurant''s staff see nothing of the visit');

set local request.jwt.claims = '{"sub":"a7a7a7a7-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select customer_phone from public.table_sessions where id = pg_temp.s(1)), '+962791234567', 'the restaurant''s staff see the customer''s number');
select lives_ok($$ update public.orders set status = 'CONFIRMED' where id = pg_temp.o(1) $$, 'the cashier confirms a pickup order');
select is((select status::text from public.orders where id = pg_temp.o(1)), 'CONFIRMED', 'it is confirmed');
select throws_ok($$ update public.orders set status = 'READY' where id = pg_temp.o(1) $$, '23514', null, 'still one step at a time');
select throws_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id = pg_temp.o(1) $$, '42501', null, 'the cashier does not cancel');
select throws_ok($$ update public.orders set status = 'CONFIRMED' where id = pg_temp.o(8) $$, '42501', null, 'and still does not confirm an order at a table');
select lives_ok($$ update public.orders set status = 'PREPARING' where id = pg_temp.o(1) $$, 'preparing');
select lives_ok($$ update public.orders set status = 'READY' where id = pg_temp.o(1) $$, 'ready');
select lives_ok($$ update public.orders set status = 'SERVED' where id = pg_temp.o(1) $$, 'handed over');
select lives_ok($$ update public.orders set status = 'COMPLETED' where id = pg_temp.o(1) $$, 'completed: the cashier took the pickup order all the way');
select is((select status::text from public.table_sessions where id = pg_temp.s(1)), 'OPEN', 'the visit stays open: its other order is not finished');

-- The waiter works on pickup orders as on any other, and cancels before the kitchen starts.
set local request.jwt.claims = '{"sub":"a7a7a7a7-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'GUEST_CHANGED_MIND' where id = pg_temp.o(3) $$,
  'the waiter cancels the visit''s last unfinished order');
reset role;
set local request.jwt.claims = '';
select results_eq(
  $$ select status::text, ended_at is not null from public.table_sessions where id = pg_temp.s(1) $$,
  $$ values ('CLOSED', true) $$, 'and the pickup visit ended by itself (although a waiter cannot close visits)');
select throws_ok($$ select public.place_order(pg_temp.payload(9, pg_temp.s(1), pg_temp.s(9))) $$, '23514', null, 'nothing more can be ordered into it');
select is(public.get_public_session('tp-a', pg_temp.s(1)) ->> 'status', 'CLOSED', 'the customer''s phone sees it as closed');

-- A table visit does NOT end by itself when its orders are finished: the cashier closes the table.
update public.orders set status = 'CANCELLED', cancel_reason = 'MISTAKE' where id = pg_temp.o(8);
select is((select status::text from public.table_sessions where id = pg_temp.s(90)), 'OPEN', 'a table visit stays open after its last order is finished');

-- ── Privileges ──
select function_privs_are('public', 'is_pickup_session', array['uuid', 'uuid'], 'anon', array[]::text[], 'anon cannot call is_pickup_session');
select function_privs_are('public', 'place_order', array['jsonb'], 'authenticated', array[]::text[], 'place_order is still for the server only');
select function_privs_are('public', 'get_public_session', array['text', 'uuid'], 'anon', array['EXECUTE'], 'get_public_session is still public');

select * from finish();
rollback;
