-- Proves option groups / options / item links are isolated per restaurant and only
-- owner/manager can change them. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'opt-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000d2', 'opt-waiter-a@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-8888-4000-8000-000000000000', 'opt-a', 'Opt A', 'خيارات أ'),
  ('bbbbbbbb-8888-4000-8000-000000000000', 'opt-b', 'Opt B', 'خيارات ب');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-8888-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'OWNER'),
  ('aaaaaaaa-8888-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'WAITER');
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values
  ('aaaaaaaa-9999-4000-8000-000000000001', 'aaaaaaaa-8888-4000-8000-000000000000', 'A', 'أ'),
  ('bbbbbbbb-9999-4000-8000-000000000001', 'bbbbbbbb-8888-4000-8000-000000000000', 'B', 'ب');
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('aaaaaaaa-9999-4000-8000-000000000002', 'aaaaaaaa-8888-4000-8000-000000000000', 'aaaaaaaa-9999-4000-8000-000000000001', 'A item', 'صنف أ', 1000),
  ('bbbbbbbb-9999-4000-8000-000000000002', 'bbbbbbbb-8888-4000-8000-000000000000', 'bbbbbbbb-9999-4000-8000-000000000001', 'B item', 'صنف ب', 1000);
insert into public.option_groups (id, restaurant_id, name_en, name_ar, min_select, max_select) values
  ('aaaaaaaa-9999-4000-8000-000000000003', 'aaaaaaaa-8888-4000-8000-000000000000', 'A size', 'حجم أ', 1, 1),
  ('bbbbbbbb-9999-4000-8000-000000000003', 'bbbbbbbb-8888-4000-8000-000000000000', 'B size', 'حجم ب', 1, 1);
insert into public.options (id, restaurant_id, group_id, name_en, name_ar, price_delta_fils) values
  ('bbbbbbbb-9999-4000-8000-000000000004', 'bbbbbbbb-8888-4000-8000-000000000000', 'bbbbbbbb-9999-4000-8000-000000000003', 'B large', 'كبير ب', 1000);

-- ── Schema guards (superuser) ──
select throws_ok(
  $$ insert into public.option_groups (restaurant_id, name_en, name_ar, min_select, max_select)
     values ('aaaaaaaa-8888-4000-8000-000000000000', 'Bad', 'سيء', 3, 1) $$,
  '23514', null, 'min_select > max_select is rejected');

-- ── Owner of A ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000d1","role":"authenticated"}';

select results_eq($$ select name_en from public.option_groups $$, $$ values ('A size') $$, 'owner A sees only A groups');
select is((select count(*) from public.options), 0::bigint, 'owner A cannot see B options');
select lives_ok(
  $$ insert into public.options (restaurant_id, group_id, name_en, name_ar, price_delta_fils)
     values ('aaaaaaaa-8888-4000-8000-000000000000', 'aaaaaaaa-9999-4000-8000-000000000003', 'Large', 'كبير', 1000) $$,
  'owner A can add an option to an A group');
select lives_ok(
  $$ insert into public.menu_item_option_groups (restaurant_id, item_id, group_id)
     values ('aaaaaaaa-8888-4000-8000-000000000000', 'aaaaaaaa-9999-4000-8000-000000000002', 'aaaaaaaa-9999-4000-8000-000000000003') $$,
  'owner A can attach an A group to an A item');
select throws_ok(
  $$ insert into public.menu_item_option_groups (restaurant_id, item_id, group_id)
     values ('aaaaaaaa-8888-4000-8000-000000000000', 'aaaaaaaa-9999-4000-8000-000000000002', 'bbbbbbbb-9999-4000-8000-000000000003') $$,
  '23503', null, 'an A item cannot be linked to a B group (composite FK)');
select throws_ok(
  $$ insert into public.options (restaurant_id, group_id, name_en, name_ar)
     values ('aaaaaaaa-8888-4000-8000-000000000000', 'bbbbbbbb-9999-4000-8000-000000000003', 'Sneaky', 'متسلل') $$,
  '23503', null, 'an A option cannot go into a B group (composite FK)');
select throws_ok(
  $$ insert into public.option_groups (restaurant_id, name_en, name_ar)
     values ('bbbbbbbb-8888-4000-8000-000000000000', 'Hacked', 'مخترق') $$,
  '42501', null, 'owner A cannot add a group to B');
select throws_ok(
  $$ update public.options set restaurant_id = 'bbbbbbbb-8888-4000-8000-000000000000' $$,
  '42501', null, 'restaurant_id of an option cannot be changed (column grant)');
update public.options set price_delta_fils = 1 where id = 'bbbbbbbb-9999-4000-8000-000000000004';

-- ── Waiter of A ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000d2","role":"authenticated"}';
select is((select count(*) from public.menu_item_option_groups), 1::bigint, 'waiter A can read A item links');
select throws_ok(
  $$ insert into public.option_groups (restaurant_id, name_en, name_ar)
     values ('aaaaaaaa-8888-4000-8000-000000000000', 'Waiter', 'نادل') $$,
  '42501', null, 'waiter cannot add option groups');
delete from public.menu_item_option_groups;

-- ── Verify (superuser) ──
reset role;
select is((select count(*) from public.menu_item_option_groups where restaurant_id = 'aaaaaaaa-8888-4000-8000-000000000000'),
  1::bigint, 'waiter could not detach groups');
select is((select price_delta_fils from public.options where id = 'bbbbbbbb-9999-4000-8000-000000000004'), 1000::bigint,
  'B option price unchanged by owner A');

select * from finish();
rollback;
