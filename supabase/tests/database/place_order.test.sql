-- place_order(jsonb) writes an order with its lines and options atomically, only for the server (service_role).
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-1010-4000-8000-000000000000', 'po-a', 'PO A', 'أ'),
  ('bbbbbbbb-1010-4000-8000-000000000000', 'po-b', 'PO B', 'ب');
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values
  ('aaaaaaaa-2020-4000-8000-000000000001', 'aaaaaaaa-1010-4000-8000-000000000000', 'A', 'أ'),
  ('bbbbbbbb-2020-4000-8000-000000000001', 'bbbbbbbb-1010-4000-8000-000000000000', 'B', 'ب');
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('aaaaaaaa-2020-4000-8000-000000000002', 'aaaaaaaa-1010-4000-8000-000000000000', 'aaaaaaaa-2020-4000-8000-000000000001', 'A item', 'صنف أ', 2500),
  ('bbbbbbbb-2020-4000-8000-000000000002', 'bbbbbbbb-1010-4000-8000-000000000000', 'bbbbbbbb-2020-4000-8000-000000000001', 'B item', 'صنف ب', 2500);
insert into public.option_groups (id, restaurant_id, name_en, name_ar, min_select, max_select) values
  ('aaaaaaaa-2020-4000-8000-000000000003', 'aaaaaaaa-1010-4000-8000-000000000000', 'Size', 'حجم', 0, 1);
insert into public.options (id, restaurant_id, group_id, name_en, name_ar, price_delta_fils) values
  ('aaaaaaaa-2020-4000-8000-000000000004', 'aaaaaaaa-1010-4000-8000-000000000000', 'aaaaaaaa-2020-4000-8000-000000000003', 'Large', 'كبير', 500);

-- The table session the orders belong to (an OPEN one).
insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('aaaaaaaa-3131-4000-8000-000000000001', 'aaaaaaaa-1010-4000-8000-000000000000', '1', 'place-order-test-token-00000001');
insert into public.table_sessions (id, restaurant_id, table_id) values
  ('aaaaaaaa-3030-4000-8000-000000000001', 'aaaaaaaa-1010-4000-8000-000000000000', 'aaaaaaaa-3131-4000-8000-000000000001');

-- A payload for restaurant A: 2 x (2.500 + 0.500 Large) = 6.000; service 10% = 0.600; tax 16% of 6.600 = 1.056; total 7.656.
-- The order id and item id are built from p_n so each call is unique.
create function pg_temp.payload(p_n int, p_menu_item text, p_line_total bigint, p_total bigint, p_with_items boolean default true)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', 'aaaaaaaa-5050-4000-8000-' || lpad(p_n::text, 12, '0'),
    'restaurant_id', 'aaaaaaaa-1010-4000-8000-000000000000',
    'session_id', 'aaaaaaaa-3030-4000-8000-000000000001', 'number', p_n,
    'tax_rate_bp', 1600, 'service_charge_bp', 1000,
    'subtotal_fils', 6000, 'service_charge_fils', 600, 'tax_fils', 1056, 'total_fils', p_total,
    'created_at', '2026-10-10T12:00:00Z',
    'items', case when p_with_items then jsonb_build_array(jsonb_build_object(
      'id', 'aaaaaaaa-6060-4000-8000-' || lpad(p_n::text, 12, '0'), 'menu_item_id', p_menu_item,
      'name_en', 'A item', 'name_ar', 'صنف أ',
      'unit_price_fils', 2500, 'quantity', 2, 'line_total_fils', p_line_total,
      'options', jsonb_build_array(jsonb_build_object(
        'option_id', 'aaaaaaaa-2020-4000-8000-000000000004', 'group_name_en', 'Size', 'group_name_ar', 'حجم',
        'name_en', 'Large', 'name_ar', 'كبير', 'price_delta_fils', 500)))) else '[]'::jsonb end);
$$;

-- ── A good order ──
-- Counts are scoped to this test's own restaurant: the local database may hold real orders (demo or browser tests).
select lives_ok($$ select public.place_order(pg_temp.payload(1, 'aaaaaaaa-2020-4000-8000-000000000002', 6000, 7656)) $$,
  'a valid order is placed');
select is((select count(*) from public.orders where restaurant_id = 'aaaaaaaa-1010-4000-8000-000000000000'), 1::bigint, 'one order');
select is((select count(*) from public.order_items where restaurant_id = 'aaaaaaaa-1010-4000-8000-000000000000'), 1::bigint, 'with one line');
select is((select count(*) from public.order_item_options where restaurant_id = 'aaaaaaaa-1010-4000-8000-000000000000'), 1::bigint, 'and one picked option');

-- ── Bad orders leave nothing behind (the whole call is one transaction) ──
select throws_ok($$ select public.place_order(pg_temp.payload(2, 'aaaaaaaa-2020-4000-8000-000000000002', 4000, 7656)) $$,
  '23514', null, 'a line total below unit price x quantity is refused');
select is((select count(*) from public.orders where restaurant_id = 'aaaaaaaa-1010-4000-8000-000000000000'), 1::bigint, 'the refused order left no order row behind');
select throws_ok($$ select public.place_order(pg_temp.payload(1, 'aaaaaaaa-2020-4000-8000-000000000002', 6000, 7656)) $$,
  '23505', null, 'an order number cannot be used twice in a restaurant');
select throws_ok($$ select public.place_order(pg_temp.payload(3, 'bbbbbbbb-2020-4000-8000-000000000002', 6000, 7656)) $$,
  '23503', null, 'an A order cannot contain a B menu item');
select is((select count(*) from public.orders where restaurant_id = 'aaaaaaaa-1010-4000-8000-000000000000'), 1::bigint, 'still only the one good order');
select throws_ok($$ select public.place_order(pg_temp.payload(4, 'aaaaaaaa-2020-4000-8000-000000000002', 6000, 7656, false)) $$,
  '23514', null, 'an order without lines is refused');

-- ── Only the server may call it ──
set local role authenticated;
select throws_ok($$ select public.place_order('{}'::jsonb) $$, '42501', null, 'signed-in staff cannot call place_order');
set local role anon;
select throws_ok($$ select public.place_order('{}'::jsonb) $$, '42501', null, 'anonymous visitors cannot call place_order');

select * from finish();
rollback;
