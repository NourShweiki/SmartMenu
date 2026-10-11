-- get_public_session_orders: what a guest's phone may learn about the orders of its own table visit, and nothing else.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.restaurants (id, slug, name_en, name_ar) values
  ('eeeeeeee-1a1a-4000-8000-000000000000', 'pso-a', 'PSO A', 'أ'),
  ('ffffffff-1a1a-4000-8000-000000000000', 'pso-b', 'PSO B', 'ب');
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values
  ('eeeeeeee-2b2b-4000-8000-000000000001', 'eeeeeeee-1a1a-4000-8000-000000000000', 'A', 'أ');
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('eeeeeeee-3c3c-4000-8000-000000000001', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-2b2b-4000-8000-000000000001', 'Kebab', 'كباب', 4500),
  ('eeeeeeee-3c3c-4000-8000-000000000002', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-2b2b-4000-8000-000000000001', 'Hummus', 'حمص', 1250);
-- Two tables with a visit each at restaurant A; one table with a visit at restaurant B.
insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('eeeeeeee-4d4d-4000-8000-000000000001', 'eeeeeeee-1a1a-4000-8000-000000000000', '1', 'pso-test-token-00000000000001'),
  ('eeeeeeee-4d4d-4000-8000-000000000002', 'eeeeeeee-1a1a-4000-8000-000000000000', '2', 'pso-test-token-00000000000002'),
  ('ffffffff-4d4d-4000-8000-000000000001', 'ffffffff-1a1a-4000-8000-000000000000', '1', 'pso-test-token-00000000000003');
insert into public.table_sessions (id, restaurant_id, table_id) values
  ('eeeeeeee-5e5e-4000-8000-000000000001', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-4d4d-4000-8000-000000000001'),
  ('eeeeeeee-5e5e-4000-8000-000000000002', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-4d4d-4000-8000-000000000002'),
  ('ffffffff-5e5e-4000-8000-000000000001', 'ffffffff-1a1a-4000-8000-000000000000', 'ffffffff-4d4d-4000-8000-000000000001');

-- Visit 1: order 1 (READY, placed first: Kebab x2 then Hummus x1), order 2 (CANCELLED, placed later). Visit 2: order 3.
insert into public.orders (id, restaurant_id, session_id, number, status, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp, created_at, cancel_reason, cancelled_at) values
  ('eeeeeeee-6f6f-4000-8000-000000000001', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-5e5e-4000-8000-000000000001', 1, 'READY', 10250, 1025, 1804, 13079, 1600, 1000, '2026-10-11T18:00:00Z', null, null),
  ('eeeeeeee-6f6f-4000-8000-000000000002', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-5e5e-4000-8000-000000000001', 2, 'CANCELLED', 1250, 125, 220, 1595, 1600, 1000, '2026-10-11T18:10:00Z', 'ITEM_UNAVAILABLE', '2026-10-11T18:12:00Z'),
  ('eeeeeeee-6f6f-4000-8000-000000000003', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-5e5e-4000-8000-000000000002', 3, 'NEW', 1250, 125, 220, 1595, 1600, 1000, '2026-10-11T18:05:00Z', null, null);
insert into public.order_items (id, restaurant_id, order_id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils, position) values
  ('eeeeeeee-7a7a-4000-8000-000000000002', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-6f6f-4000-8000-000000000001', 'eeeeeeee-3c3c-4000-8000-000000000002', 'Hummus', 'حمص', 1250, 1, 1250, 1),
  ('eeeeeeee-7a7a-4000-8000-000000000001', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-6f6f-4000-8000-000000000001', 'eeeeeeee-3c3c-4000-8000-000000000001', 'Kebab', 'كباب', 4500, 2, 9000, 0),
  ('eeeeeeee-7a7a-4000-8000-000000000003', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-6f6f-4000-8000-000000000002', 'eeeeeeee-3c3c-4000-8000-000000000002', 'Hummus', 'حمص', 1250, 1, 1250, 0),
  ('eeeeeeee-7a7a-4000-8000-000000000004', 'eeeeeeee-1a1a-4000-8000-000000000000', 'eeeeeeee-6f6f-4000-8000-000000000003', 'eeeeeeee-3c3c-4000-8000-000000000002', 'Hummus', 'حمص', 1250, 1, 1250, 0);

create function pg_temp.mine() returns jsonb language sql as
  $$ select public.get_public_session_orders('pso-a', 'eeeeeeee-5e5e-4000-8000-000000000001') $$;

-- ── A visitor who is not signed in (what the app's public client is) ──
set local role anon;

select is(jsonb_array_length(pg_temp.mine()), 2, 'the visit''s two orders come back, and only they');
select is(pg_temp.mine() -> 0 ->> 'number', '1', 'oldest first');
select is(pg_temp.mine() -> 1 ->> 'status', 'CANCELLED', 'a cancelled order is included, as cancelled');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.mine() -> 0) k),
  array['items', 'number', 'placed_at', 'status', 'total_fils'],
  'an order carries exactly these fields');
select is(pg_temp.mine() -> 0 ->> 'total_fils', '13079', 'the total is the order''s own, in fils');
select is(
  pg_temp.mine() -> 0 -> 'items',
  '[{"name_en": "Kebab", "name_ar": "كباب", "quantity": 2}, {"name_en": "Hummus", "name_ar": "حمص", "quantity": 1}]'::jsonb,
  'lines in the order they were ordered, with both names and the quantity, and nothing else');
select unalike(pg_temp.mine()::text, '%eeeeeeee-%', 'no id of anything is given out');
select unalike(pg_temp.mine()::text, '%ITEM_UNAVAILABLE%', 'the reason of a cancellation is not given out');

select is(public.get_public_session_orders('  PSO-A ', 'eeeeeeee-5e5e-4000-8000-000000000001'), pg_temp.mine(), 'the address is matched whatever its case or spaces');
select is(public.get_public_session_orders('pso-b', 'eeeeeeee-5e5e-4000-8000-000000000001'), '[]'::jsonb, 'the session of one restaurant shows nothing at another restaurant''s address');
select is(public.get_public_session_orders('pso-a', '00000000-0000-4000-8000-000000000000'), '[]'::jsonb, 'an unknown session shows nothing (not an error)');
select is(jsonb_array_length(public.get_public_session_orders('pso-a', 'eeeeeeee-5e5e-4000-8000-000000000002')), 1, 'the other table''s visit has its own single order');

select throws_ok($$ select count(*) from public.orders $$, '42501', null, 'the orders table itself stays closed to visitors');

select * from finish();
rollback;
