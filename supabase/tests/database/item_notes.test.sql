-- Item notes (migration item_notes, PROJECT_SPEC.md §3.3): the item's "allow a note" switch, the note on an order
-- line written by place_order (only where the item takes one, at most 100 characters), and who may change the switch.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'notes-owner@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000b2', 'notes-waiter@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-1111-4000-8000-0000000000b0', 'notes-a', 'Notes A', 'ملاحظات أ');
insert into public.restaurant_settings (restaurant_id) values ('aaaaaaaa-1111-4000-8000-0000000000b0');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-1111-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'OWNER'),
  ('aaaaaaaa-1111-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-0000000000b2', 'WAITER');
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values
  ('aaaaaaaa-2222-4000-8000-0000000000b0', 'aaaaaaaa-1111-4000-8000-0000000000b0', 'Coffee', 'قهوة');
-- A latte that takes a note, and a croissant that does not (the default).
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils, allows_note) values
  ('aaaaaaaa-2222-4000-8000-0000000000b1', 'aaaaaaaa-1111-4000-8000-0000000000b0', 'aaaaaaaa-2222-4000-8000-0000000000b0', 'Latte', 'لاتيه', 2250, true);
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('aaaaaaaa-2222-4000-8000-0000000000b2', 'aaaaaaaa-1111-4000-8000-0000000000b0', 'aaaaaaaa-2222-4000-8000-0000000000b0', 'Croissant', 'كرواسون', 1500);
insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('aaaaaaaa-3333-4000-8000-0000000000b0', 'aaaaaaaa-1111-4000-8000-0000000000b0', '1', 'item-notes-test-token-000000001');
insert into public.table_sessions (id, restaurant_id, table_id) values
  ('aaaaaaaa-4444-4000-8000-0000000000b0', 'aaaaaaaa-1111-4000-8000-0000000000b0', 'aaaaaaaa-3333-4000-8000-0000000000b0');

-- One order with one line of the given item and note (totals are not what this test is about).
create function pg_temp.with_note(p_n int, p_item text, p_note text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', 'aaaaaaaa-5555-4000-8000-' || lpad(p_n::text, 12, '0'),
    'restaurant_id', 'aaaaaaaa-1111-4000-8000-0000000000b0',
    'session_id', 'aaaaaaaa-4444-4000-8000-0000000000b0', 'number', p_n,
    'tax_rate_bp', 0, 'service_charge_bp', 0,
    'subtotal_fils', 2250, 'service_charge_fils', 0, 'tax_fils', 0, 'total_fils', 2250,
    'created_at', '2026-11-28T09:00:00Z',
    'items', jsonb_build_array(jsonb_build_object(
      'id', 'aaaaaaaa-6666-4000-8000-' || lpad(p_n::text, 12, '0'), 'menu_item_id', p_item,
      'name_en', 'X', 'name_ar', 'س', 'unit_price_fils', 2250, 'quantity', 1, 'line_total_fils', 2250,
      'note', p_note, 'options', '[]'::jsonb)));
$$;

select is((select allows_note from public.menu_items where id = 'aaaaaaaa-2222-4000-8000-0000000000b2'), false,
  'an item takes no note unless switched on');

-- ── The public menu says which items take a note ──
set local role anon;
select results_eq(
  $$ select i ->> 'name_en', (i ->> 'allows_note')::boolean
     from jsonb_array_elements(public.get_public_menu('notes-a') -> 0 -> 'items') as t(i) order by 1 $$,
  $$ values ('Croissant'::text, false), ('Latte'::text, true) $$,
  'the public menu carries allows_note per item');

-- ── place_order (the server) stores the note, only where the item takes one ──
reset role;
set local role service_role;
select lives_ok($$ select public.place_order(pg_temp.with_note(1, 'aaaaaaaa-2222-4000-8000-0000000000b1', 'less sugar')) $$,
  'a note on an item that takes one is stored');
select throws_ok($$ select public.place_order(pg_temp.with_note(2, 'aaaaaaaa-2222-4000-8000-0000000000b2', 'warm it up')) $$,
  '23514', 'this item does not take a note', 'a note on an item that takes none is refused');
select throws_ok($$ select public.place_order(pg_temp.with_note(3, 'aaaaaaaa-2222-4000-8000-0000000000b1', repeat('x', 101))) $$,
  '23514', null, 'a note longer than 100 characters is refused');
select lives_ok($$ select public.place_order(pg_temp.with_note(4, 'aaaaaaaa-2222-4000-8000-0000000000b1', repeat('ق', 100))) $$,
  '100 characters (Arabic letters count once each) is fine');
select lives_ok($$ select public.place_order(pg_temp.with_note(5, 'aaaaaaaa-2222-4000-8000-0000000000b2', '')) $$,
  'an empty note is no note, also on an item that takes none');
reset role;
select results_eq(
  $$ select number, i.note from public.orders o join public.order_items i on i.order_id = o.id
     where o.restaurant_id = 'aaaaaaaa-1111-4000-8000-0000000000b0' and number in (1, 5) order by number $$,
  $$ values (1, 'less sugar'::text), (5, null::text) $$,
  'stored as sent, and empty as no note');
select is((select count(*) from public.orders where restaurant_id = 'aaaaaaaa-1111-4000-8000-0000000000b0' and number in (2, 3)), 0::bigint,
  'a refused order leaves nothing behind');

-- ── Staff read the note; the switch is the menu managers' (the waiter only marks sold out) ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000b2","role":"authenticated"}';
select is((select note from public.order_items where order_id = 'aaaaaaaa-5555-4000-8000-000000000001'), 'less sugar',
  'staff of the restaurant read the note with the order');
update public.menu_items set allows_note = true where id = 'aaaaaaaa-2222-4000-8000-0000000000b2';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000b1","role":"authenticated"}';
select lives_ok($$ update public.menu_items set allows_note = false where id = 'aaaaaaaa-2222-4000-8000-0000000000b1' $$,
  'the owner can switch notes off for an item');
reset role;
select results_eq(
  $$ select name_en, allows_note from public.menu_items where restaurant_id = 'aaaaaaaa-1111-4000-8000-0000000000b0' order by 1 $$,
  $$ values ('Croissant'::text, false), ('Latte'::text, false) $$,
  'the owner''s change is stored; the waiter''s attempt changed nothing');

select * from finish();
rollback;
