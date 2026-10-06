-- Proves menus are isolated per restaurant and only owner/manager can change them.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Fixtures (as superuser): restaurants A and B, owner of each, a waiter in A, one category + item each.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'menu-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'menu-waiter-a@test.local'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'menu-owner-b@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-2222-4000-8000-000000000000', 'menu-a', 'Menu A', 'قائمة أ'),
  ('bbbbbbbb-2222-4000-8000-000000000000', 'menu-b', 'Menu B', 'قائمة ب');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-2222-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'OWNER'),
  ('aaaaaaaa-2222-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'WAITER'),
  ('bbbbbbbb-2222-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'OWNER');
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values
  ('aaaaaaaa-3333-4000-8000-000000000000', 'aaaaaaaa-2222-4000-8000-000000000000', 'A grills', 'مشاوي أ'),
  ('bbbbbbbb-3333-4000-8000-000000000000', 'bbbbbbbb-2222-4000-8000-000000000000', 'B grills', 'مشاوي ب');
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('aaaaaaaa-4444-4000-8000-000000000000', 'aaaaaaaa-2222-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000000', 'A kebab', 'كباب أ', 4500),
  ('bbbbbbbb-4444-4000-8000-000000000000', 'bbbbbbbb-2222-4000-8000-000000000000', 'bbbbbbbb-3333-4000-8000-000000000000', 'B kebab', 'كباب ب', 4500);

-- ── Schema guard (as superuser) ──
select throws_ok(
  $$ insert into public.menu_items (restaurant_id, category_id, name_en, name_ar, price_fils)
     values ('aaaaaaaa-2222-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000000', 'Bad', 'سيء', -1) $$,
  '23514', null, 'negative prices are rejected by the schema');

-- ── Act as owner of A ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}';

select results_eq($$ select name_en from public.menu_items $$, $$ values ('A kebab') $$,
  'owner A sees only restaurant A items');
select is((select count(*) from public.menu_categories where restaurant_id = 'bbbbbbbb-2222-4000-8000-000000000000'), 0::bigint,
  'owner A cannot read B categories');

select lives_ok(
  $$ insert into public.menu_items (restaurant_id, category_id, name_en, name_ar, price_fils)
     values ('aaaaaaaa-2222-4000-8000-000000000000', 'aaaaaaaa-3333-4000-8000-000000000000', 'A hummus', 'حمص أ', 1250) $$,
  'owner A can add an item to A');
select lives_ok(
  $$ update public.menu_items set price_fils = 5000, is_sold_out = true where id = 'aaaaaaaa-4444-4000-8000-000000000000' $$,
  'owner A can change price and sold-out of own item');

select throws_ok(
  $$ insert into public.menu_categories (restaurant_id, name_en, name_ar)
     values ('bbbbbbbb-2222-4000-8000-000000000000', 'Hacked', 'مخترق') $$,
  '42501', null, 'owner A cannot add a category to B');
select throws_ok(
  $$ insert into public.menu_items (restaurant_id, category_id, name_en, name_ar, price_fils)
     values ('aaaaaaaa-2222-4000-8000-000000000000', 'bbbbbbbb-3333-4000-8000-000000000000', 'Sneaky', 'متسلل', 100) $$,
  '23503', null, 'an A item cannot point at a B category (composite FK)');
select throws_ok(
  $$ update public.menu_items set restaurant_id = 'bbbbbbbb-2222-4000-8000-000000000000' where id = 'aaaaaaaa-4444-4000-8000-000000000000' $$,
  '42501', null, 'restaurant_id cannot be changed (column grant)');
select throws_ok(
  $$ delete from public.menu_items where id = 'aaaaaaaa-4444-4000-8000-000000000000' $$,
  '42501', null, 'staff cannot hard-delete (soft delete only)');

update public.menu_items set price_fils = 1 where id = 'bbbbbbbb-4444-4000-8000-000000000000';

-- ── Act as waiter of A ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a2","role":"authenticated"}';

select is((select count(*) from public.menu_items), 2::bigint, 'waiter A reads A menu');
select throws_ok(
  $$ insert into public.menu_categories (restaurant_id, name_en, name_ar)
     values ('aaaaaaaa-2222-4000-8000-000000000000', 'Waiter cat', 'فئة') $$,
  '42501', null, 'waiter cannot add categories');
update public.menu_items set price_fils = 2 where id = 'aaaaaaaa-4444-4000-8000-000000000000';
select is(public.set_menu_item_sold_out('aaaaaaaa-4444-4000-8000-000000000000', false), true,
  'waiter A can mark an A item back in stock');
select is(public.set_menu_item_sold_out('bbbbbbbb-4444-4000-8000-000000000000', true), false,
  'waiter A cannot mark a B item sold out');

-- ── Act as anonymous visitor ──
reset role;
set local role anon;
select throws_ok($$ select * from public.menu_items $$, '42501', null, 'anon has no direct menu access');
select throws_ok($$ select public.set_menu_item_sold_out('aaaaaaaa-4444-4000-8000-000000000000', true) $$,
  '42501', null, 'anon cannot call set_menu_item_sold_out');

-- ── Verify as superuser ──
reset role;
select is((select price_fils from public.menu_items where id = 'bbbbbbbb-4444-4000-8000-000000000000'), 4500::bigint,
  'B price unchanged by owner A');
select is((select price_fils from public.menu_items where id = 'aaaaaaaa-4444-4000-8000-000000000000'), 5000::bigint,
  'waiter could not change A price; owner change kept');
select is((select is_sold_out from public.menu_items where id = 'aaaaaaaa-4444-4000-8000-000000000000'), false,
  'waiter sold-out change was saved');
select is((select is_sold_out from public.menu_items where id = 'bbbbbbbb-4444-4000-8000-000000000000'), false,
  'B item untouched by waiter A');
select ok((select updated_at is not null from public.menu_items where id = 'aaaaaaaa-4444-4000-8000-000000000000'),
  'updated_at is set on change');

select * from finish();
rollback;
