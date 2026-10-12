-- Takeout limits (PK001 phone, PK002 device, PK003 restaurant busy) and the cashier cancelling a takeout order.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

create function pg_temp.a() returns uuid language sql immutable as $$ select 'b8b8b8b8-1111-4000-8000-00000000000a'::uuid $$;
create function pg_temp.u(p_n int) returns uuid language sql immutable as $$ select ('b8b8b8b8-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create function pg_temp.s(p_n int) returns uuid language sql immutable as $$ select ('b8b8b8b8-5555-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create function pg_temp.o(p_n int) returns uuid language sql immutable as $$ select ('b8b8b8b8-6666-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
grant execute on function pg_temp.a(), pg_temp.u(int), pg_temp.s(int), pg_temp.o(int) to authenticated;

insert into auth.users (id, email) values (pg_temp.u(1), 'tl-cashier@test.local'), (pg_temp.u(2), 'tl-waiter@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values (pg_temp.a(), 'tl-a', 'TL A', 'أ');
insert into public.restaurant_settings (restaurant_id, dine_in_enabled, takeout_enabled) values (pg_temp.a(), true, true);
insert into public.restaurant_members (restaurant_id, user_id, role) values (pg_temp.a(), pg_temp.u(1), 'CASHIER'), (pg_temp.a(), pg_temp.u(2), 'WAITER');
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values ('b8b8b8b8-2222-4000-8000-00000000000a', pg_temp.a(), 'A', 'أ');
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('b8b8b8b8-3333-4000-8000-00000000000a', pg_temp.a(), 'b8b8b8b8-2222-4000-8000-00000000000a', 'Coffee', 'قهوة', 2500);
insert into public.restaurant_tables (id, restaurant_id, label, token) values ('b8b8b8b8-4444-4000-8000-000000000001', pg_temp.a(), '1', 'takeout-limits-test-token-0001');
insert into public.table_sessions (id, restaurant_id, table_id) values (pg_temp.s(900), pg_temp.a(), 'b8b8b8b8-4444-4000-8000-000000000001');

-- A pickup order number p_n for a NEW visit s(p_n), from a phone ending in p_phone (7 digits) and an optional device.
create function pg_temp.pickup(p_n int, p_phone text, p_device text default null, p_session uuid default null) returns jsonb language sql as $$
  select jsonb_build_object(
    'id', pg_temp.o(p_n), 'restaurant_id', pg_temp.a(), 'session_id', coalesce(p_session, pg_temp.s(p_n)), 'number', p_n, 'client_request_id', pg_temp.s(p_n),
    'tax_rate_bp', 1600, 'service_charge_bp', 0, 'subtotal_fils', 2500, 'service_charge_fils', 0, 'tax_fils', 400, 'total_fils', 2900,
    'created_at', now(),
    'pickup', jsonb_strip_nulls(jsonb_build_object('customer_name', 'Ali', 'customer_phone', '+96279' || p_phone, 'client_hash', p_device)),
    'items', jsonb_build_array(jsonb_build_object(
      'id', ('b8b8b8b8-7777-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid, 'menu_item_id', 'b8b8b8b8-3333-4000-8000-00000000000a',
      'name_en', 'Coffee', 'name_ar', 'قهوة', 'unit_price_fils', 2500, 'quantity', 1, 'line_total_fils', 2500, 'options', '[]'::jsonb)));
$$;
create function pg_temp.device(p text) returns text language sql immutable as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;

-- ── PK001: one phone number, two visits in progress at most ──
select lives_ok($$ select public.place_order(pg_temp.pickup(1, '1111111')) $$, 'a first takeout order from a number');
select lives_ok($$ select public.place_order(pg_temp.pickup(2, '1111111')) $$, 'and a second, as a separate visit');
select throws_ok($$ select public.place_order(pg_temp.pickup(3, '1111111')) $$, 'PK001', null, 'a third visit in progress for the same number is refused');
select is((select count(*) from public.table_sessions where id = pg_temp.s(3)), 0::bigint, 'and leaves nothing behind');
select is(public.place_order(pg_temp.pickup(4, '1111111', null, pg_temp.s(1)) - 'pickup' || jsonb_build_object('client_request_id', pg_temp.s(4))), pg_temp.o(4),
  'ordering again INTO an open visit is not limited');
select is(public.place_order(pg_temp.pickup(1, '1111111')), pg_temp.o(1), 'the same submission again still finds its order (not counted twice)');
select lives_ok($$ select public.place_order(pg_temp.pickup(5, '2222222')) $$, 'another number is not affected');
-- When one of the two visits is over, the number can order again.
update public.orders set status = 'CANCELLED', cancel_reason = 'NOT_COLLECTED' where id = pg_temp.o(2);
select is((select status::text from public.table_sessions where id = pg_temp.s(2)), 'CLOSED', 'an uncollected order is cancelled with its own reason, which ends its visit');
select lives_ok($$ select public.place_order(pg_temp.pickup(6, '1111111')) $$, 'and then the number can order again');

-- ── PK002: one device, three visits in ten minutes at most ──
select lives_ok($$ select public.place_order(pg_temp.pickup(10, '3000001', pg_temp.device('phone-x'))) $$, 'device: first');
select lives_ok($$ select public.place_order(pg_temp.pickup(11, '3000002', pg_temp.device('phone-x'))) $$, 'device: second (another number)');
select lives_ok($$ select public.place_order(pg_temp.pickup(12, '3000003', pg_temp.device('phone-x'))) $$, 'device: third');
select throws_ok($$ select public.place_order(pg_temp.pickup(13, '3000004', pg_temp.device('phone-x'))) $$, 'PK002', null, 'a fourth visit from the same device within ten minutes is refused, whatever number it gives');
select lives_ok($$ select public.place_order(pg_temp.pickup(14, '3000004', pg_temp.device('phone-y'))) $$, 'another device is not affected');
update public.table_sessions set started_at = now() - interval '11 minutes' where id = pg_temp.s(10);
select lives_ok($$ select public.place_order(pg_temp.pickup(15, '3000005', pg_temp.device('phone-x'))) $$, 'and the first device can order again once ten minutes have passed');
select throws_ok($$ select public.place_order(pg_temp.pickup(16, '3000006', 'not-a-hash')) $$, '23514', null, 'a device hash that is not one is refused');

-- ── PK003: twenty takeout orders waiting to be confirmed at most ──
-- 10 are waiting now (orders 1, 4, 5, 6, 10, 11, 12, 14, 15 are NEW; 2 is cancelled): fill up to 20 from fresh numbers.
select lives_ok($$ select public.place_order(pg_temp.pickup(100 + g, lpad((4000000 + g)::text, 7, '0'))) from generate_series(1, 11) g $$, 'the queue fills up to twenty waiting takeout orders');
select throws_ok($$ select public.place_order(pg_temp.pickup(200, '5000000')) $$, 'PK003', null, 'the twenty-first is refused: the restaurant is busy');
update public.orders set status = 'CONFIRMED' where id = pg_temp.o(101);
select lives_ok($$ select public.place_order(pg_temp.pickup(201, '5000001')) $$, 'once staff confirm one, takeout orders come in again');

-- ── The cashier cancels a takeout order, and still not one at a table ──
select place_order(pg_temp.pickup(300, '0000000', null, pg_temp.s(900)) - 'pickup'); -- an order at the table
set local role authenticated;
set local request.jwt.claims = '{"sub":"b8b8b8b8-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'NOT_COLLECTED' where id = pg_temp.o(5) $$, 'the cashier cancels a takeout order nobody collected');
select throws_ok($$ update public.orders set status = 'CANCELLED', cancel_reason = 'OTHER' where id = pg_temp.o(300) $$, '42501', null, 'but not an order at a table');
reset role;

select * from finish();
rollback;
