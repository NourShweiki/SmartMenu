-- Proves orders / order items / order item options are isolated per restaurant, that staff can only move an
-- order one step along the status flow, that nothing else about a placed order can change, and that a
-- placed order keeps its snapshot. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'ord-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'ord-waiter-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e3', 'ord-cashier-a@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-7777-4000-8000-000000000000', 'ord-a', 'Ord A', 'طلبات أ'),
  ('bbbbbbbb-7777-4000-8000-000000000000', 'ord-b', 'Ord B', 'طلبات ب');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'OWNER'),
  ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'WAITER'),
  ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e3', 'CASHIER');

-- Live menu of both restaurants (what orders refer to).
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values
  ('aaaaaaaa-5555-4000-8000-000000000001', 'aaaaaaaa-7777-4000-8000-000000000000', 'A', 'أ'),
  ('bbbbbbbb-5555-4000-8000-000000000001', 'bbbbbbbb-7777-4000-8000-000000000000', 'B', 'ب');
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('aaaaaaaa-5555-4000-8000-000000000002', 'aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-5555-4000-8000-000000000001', 'A item', 'صنف أ', 2500),
  ('bbbbbbbb-5555-4000-8000-000000000002', 'bbbbbbbb-7777-4000-8000-000000000000', 'bbbbbbbb-5555-4000-8000-000000000001', 'B item', 'صنف ب', 2500);
insert into public.option_groups (id, restaurant_id, name_en, name_ar, min_select, max_select) values
  ('aaaaaaaa-5555-4000-8000-000000000003', 'aaaaaaaa-7777-4000-8000-000000000000', 'A size', 'حجم أ', 0, 1),
  ('bbbbbbbb-5555-4000-8000-000000000003', 'bbbbbbbb-7777-4000-8000-000000000000', 'B size', 'حجم ب', 0, 1);
insert into public.options (id, restaurant_id, group_id, name_en, name_ar, price_delta_fils) values
  ('aaaaaaaa-5555-4000-8000-000000000004', 'aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-5555-4000-8000-000000000003', 'A large', 'كبير أ', 500),
  ('bbbbbbbb-5555-4000-8000-000000000004', 'bbbbbbbb-7777-4000-8000-000000000000', 'bbbbbbbb-5555-4000-8000-000000000003', 'B large', 'كبير ب', 500);

-- Orders belong to a real, OPEN table session of their own restaurant.
insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('aaaaaaaa-3434-4000-8000-000000000001', 'aaaaaaaa-7777-4000-8000-000000000000', '1', 'orders-test-token-a-0000000001'),
  ('bbbbbbbb-3434-4000-8000-000000000001', 'bbbbbbbb-7777-4000-8000-000000000000', '1', 'orders-test-token-b-0000000001');
insert into public.table_sessions (id, restaurant_id, table_id) values
  ('aaaaaaaa-3333-4000-8000-000000000001', 'aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-3434-4000-8000-000000000001'),
  ('bbbbbbbb-3333-4000-8000-000000000001', 'bbbbbbbb-7777-4000-8000-000000000000', 'bbbbbbbb-3434-4000-8000-000000000001');

-- ── Order numbers: 1, 2, 3 ... per restaurant ──
select is(public.next_order_number('aaaaaaaa-7777-4000-8000-000000000000'), 1, 'first order number of A is 1');
select is(public.next_order_number('aaaaaaaa-7777-4000-8000-000000000000'), 2, 'second order number of A is 2');
select is(public.next_order_number('bbbbbbbb-7777-4000-8000-000000000000'), 1, 'B has its own counter and starts at 1');

-- A1 (NEW, with a past status time so we can see it move), A2 (COMPLETED), B1 (NEW).
insert into public.orders (id, restaurant_id, session_id, number, status, subtotal_fils, service_charge_fils, tax_fils, total_fils,
                           tax_rate_bp, service_charge_bp, status_changed_at) values
  ('aaaaaaaa-4444-4000-8000-000000000001', 'aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000001', 1, 'NEW',
   3000, 300, 528, 3828, 1600, 1000, '2026-01-01T00:00:00Z'),
  ('aaaaaaaa-4444-4000-8000-000000000002', 'aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000001', 2, 'COMPLETED',
   1000, 0, 160, 1160, 1600, 0, '2026-01-01T00:00:00Z'),
  ('bbbbbbbb-4444-4000-8000-000000000001', 'bbbbbbbb-7777-4000-8000-000000000000', 'bbbbbbbb-3333-4000-8000-000000000001', 1, 'NEW',
   3000, 300, 528, 3828, 1600, 1000, '2026-01-01T00:00:00Z'),
  -- Two SERVED orders waiting for payment: the cashier completes A3, the waiter must not complete A4.
  ('aaaaaaaa-4444-4000-8000-000000000003', 'aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000001', 3, 'SERVED',
   1000, 0, 160, 1160, 1600, 0, '2026-01-01T00:00:00Z'),
  ('aaaaaaaa-4444-4000-8000-000000000004', 'aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000001', 4, 'SERVED',
   1000, 0, 160, 1160, 1600, 0, '2026-01-01T00:00:00Z');
insert into public.order_items (id, restaurant_id, order_id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils) values
  ('aaaaaaaa-2222-4000-8000-000000000001', 'aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-4444-4000-8000-000000000001',
   'aaaaaaaa-5555-4000-8000-000000000002', 'A item', 'صنف أ', 2500, 1, 3000),
  ('bbbbbbbb-2222-4000-8000-000000000001', 'bbbbbbbb-7777-4000-8000-000000000000', 'bbbbbbbb-4444-4000-8000-000000000001',
   'bbbbbbbb-5555-4000-8000-000000000002', 'B item', 'صنف ب', 2500, 1, 3000);
insert into public.order_item_options (restaurant_id, order_item_id, option_id, group_name_en, group_name_ar, name_en, name_ar, price_delta_fils) values
  ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-2222-4000-8000-000000000001', 'aaaaaaaa-5555-4000-8000-000000000004', 'A size', 'حجم أ', 'A large', 'كبير أ', 500),
  ('bbbbbbbb-7777-4000-8000-000000000000', 'bbbbbbbb-2222-4000-8000-000000000001', 'bbbbbbbb-5555-4000-8000-000000000004', 'B size', 'حجم ب', 'B large', 'كبير ب', 500);

-- ── Schema guards (superuser) ──
select throws_ok(
  $$ insert into public.orders (restaurant_id, session_id, number, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
     values ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000001', 1, 1000, 0, 160, 1160, 1600, 0) $$,
  '23505', null, 'an order number is unique within a restaurant');
select lives_ok(
  $$ insert into public.orders (restaurant_id, session_id, number, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
     values ('bbbbbbbb-7777-4000-8000-000000000000', 'bbbbbbbb-3333-4000-8000-000000000001', 2, 1000, 0, 160, 1160, 1600, 0) $$,
  'the same kind of number is fine in another restaurant');
select throws_ok(
  $$ insert into public.orders (restaurant_id, session_id, number, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
     values ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000001', 9, 1000, 0, 160, 9999, 1600, 0) $$,
  '23514', null, 'total must equal subtotal + service charge + tax');
select throws_ok(
  $$ insert into public.order_items (restaurant_id, order_id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils)
     values ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-4444-4000-8000-000000000001', 'aaaaaaaa-5555-4000-8000-000000000002', 'A item', 'صنف أ', 2500, 2, 4000) $$,
  '23514', null, 'a line total cannot be less than unit price x quantity');
select throws_ok(
  $$ insert into public.order_items (restaurant_id, order_id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils)
     values ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-4444-4000-8000-000000000001', 'aaaaaaaa-5555-4000-8000-000000000002', 'A item', 'صنف أ', 2500, 100, 250000) $$,
  '23514', null, 'a quantity above 99 is rejected');
select throws_ok(
  $$ insert into public.order_items (restaurant_id, order_id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils)
     values ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-4444-4000-8000-000000000001', 'bbbbbbbb-5555-4000-8000-000000000002', 'B item', 'صنف ب', 2500, 1, 2500) $$,
  '23503', null, 'an A order line cannot refer to a B menu item (composite FK)');
select throws_ok(
  $$ insert into public.order_items (restaurant_id, order_id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils)
     values ('aaaaaaaa-7777-4000-8000-000000000000', 'bbbbbbbb-4444-4000-8000-000000000001', 'aaaaaaaa-5555-4000-8000-000000000002', 'A item', 'صنف أ', 2500, 1, 2500) $$,
  '23503', null, 'an A line cannot be put on a B order (composite FK)');
select throws_ok(
  $$ insert into public.order_item_options (restaurant_id, order_item_id, option_id, group_name_en, group_name_ar, name_en, name_ar, price_delta_fils)
     values ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-2222-4000-8000-000000000001', 'bbbbbbbb-5555-4000-8000-000000000004', 'B size', 'حجم ب', 'B large', 'كبير ب', 500) $$,
  '23503', null, 'an A line cannot refer to a B option (composite FK)');

-- ── Status flow is enforced by the database itself ──
select throws_ok(
  $$ update public.orders set status = 'PREPARING' where id = 'aaaaaaaa-4444-4000-8000-000000000001' $$,
  '23514', null, 'NEW cannot skip to PREPARING (even for superuser)');
select throws_ok(
  $$ update public.orders set status = 'NEW' where id = 'aaaaaaaa-4444-4000-8000-000000000002' $$,
  '23514', null, 'a COMPLETED order cannot go back');

-- A placed order keeps its snapshot when the menu changes.
update public.menu_items set name_en = 'Renamed', price_fils = 9999 where id = 'aaaaaaaa-5555-4000-8000-000000000002';
select results_eq(
  $$ select name_en, unit_price_fils from public.order_items where id = 'aaaaaaaa-2222-4000-8000-000000000001' $$,
  $$ values ('A item'::text, 2500::bigint) $$,
  'the order line keeps the name and price it was ordered with');

-- ── Owner of A ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1","role":"authenticated"}';

select is((select count(*) from public.orders), 4::bigint, 'owner A sees only the 4 A orders');
select is((select count(*) from public.order_items), 1::bigint, 'owner A sees only A order lines');
select is((select count(*) from public.order_item_options), 1::bigint, 'owner A sees only A order options');
select lives_ok(
  $$ update public.orders set status = 'CONFIRMED' where id = 'aaaaaaaa-4444-4000-8000-000000000001' $$,
  'owner A can confirm a NEW order');
select throws_ok(
  $$ update public.orders set status = 'SERVED' where id = 'aaaaaaaa-4444-4000-8000-000000000001' $$,
  '23514', null, 'CONFIRMED cannot skip to SERVED');
select throws_ok(
  $$ update public.orders set status = 'NEW' where id = 'aaaaaaaa-4444-4000-8000-000000000001' $$,
  '23514', null, 'CONFIRMED cannot go back to NEW');
select throws_ok(
  $$ update public.orders set total_fils = 0 where id = 'aaaaaaaa-4444-4000-8000-000000000001' $$,
  '42501', null, 'totals of a placed order cannot be changed (column grant)');
select throws_ok(
  $$ insert into public.orders (restaurant_id, session_id, number, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
     values ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000001', 50, 0, 0, 0, 0, 0, 0) $$,
  '42501', null, 'staff cannot insert orders directly');
select throws_ok(
  $$ delete from public.orders where id = 'aaaaaaaa-4444-4000-8000-000000000001' $$,
  '42501', null, 'orders cannot be deleted');
select lives_ok(
  $$ update public.orders set status = 'CONFIRMED' where id = 'bbbbbbbb-4444-4000-8000-000000000001' $$,
  'owner A updating a B order simply matches no rows');
select throws_ok(
  $$ select public.next_order_number('aaaaaaaa-7777-4000-8000-000000000000') $$,
  '42501', null, 'staff cannot call next_order_number');
select throws_ok(
  $$ select * from public.order_counters $$,
  '42501', null, 'staff cannot read the order counters');

-- ── Waiter of A ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e2","role":"authenticated"}';
select is((select count(*) from public.orders), 4::bigint, 'waiter A can read A orders');
select lives_ok(
  $$ update public.orders set status = 'PREPARING' where id = 'aaaaaaaa-4444-4000-8000-000000000001' $$,
  'waiter A can move an order to PREPARING');
select throws_ok(
  $$ update public.orders set status = 'COMPLETED' where id = 'aaaaaaaa-4444-4000-8000-000000000004' $$,
  '42501', null, 'waiter A cannot complete an order (that is the cashier''s step after payment)');

-- ── Cashier of A ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e3","role":"authenticated"}';
select is((select count(*) from public.orders), 4::bigint, 'cashier A can read A orders');
select throws_ok(
  $$ update public.orders set status = 'READY' where id = 'aaaaaaaa-4444-4000-8000-000000000001' $$,
  '42501', null, 'cashier A cannot move an order to anything but COMPLETED');
select lives_ok(
  $$ update public.orders set status = 'COMPLETED' where id = 'aaaaaaaa-4444-4000-8000-000000000003' $$,
  'cashier A can complete a SERVED order after payment');

-- ── Not signed in ──
set local role anon;
select throws_ok($$ select * from public.orders $$, '42501', null, 'anonymous visitors cannot read orders');

-- ── Back to superuser: what really happened ──
reset role;
select is((select status::text from public.orders where id = 'bbbbbbbb-4444-4000-8000-000000000001'), 'NEW',
  'B order is untouched by A staff');
select is((select status::text from public.orders where id = 'aaaaaaaa-4444-4000-8000-000000000001'), 'PREPARING',
  'cashier could not move the order; the waiter did');
select is((select status::text from public.orders where id = 'aaaaaaaa-4444-4000-8000-000000000003'), 'COMPLETED',
  'the cashier completed the paid order');
select is((select status::text from public.orders where id = 'aaaaaaaa-4444-4000-8000-000000000004'), 'SERVED',
  'the waiter could not complete the other order');
select ok((select status_changed_at from public.orders where id = 'aaaaaaaa-4444-4000-8000-000000000001') > '2026-01-01T00:00:00Z',
  'status_changed_at moves forward when the status changes');

select * from finish();
rollback;
