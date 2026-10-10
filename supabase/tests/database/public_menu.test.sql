-- The public menu read path returns exactly what a customer may see, for one restaurant, and nothing else.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-1a1a-4000-8000-000000000000', 'pm-a', 'PM A', 'أ'),
  ('bbbbbbbb-1a1a-4000-8000-000000000000', 'pm-b', 'PM B', 'ب');

-- Restaurant A: a visible category (sort 1), a visible one (sort 0, so it comes first), a hidden one, a deleted one.
insert into public.menu_categories (id, restaurant_id, name_en, name_ar, sort_order, is_hidden, deleted_at) values
  ('aaaaaaaa-2b2b-4000-8000-000000000001', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'Mains', 'رئيسية', 1, false, null),
  ('aaaaaaaa-2b2b-4000-8000-000000000002', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'Starters', 'مقبلات', 0, false, null),
  ('aaaaaaaa-2b2b-4000-8000-000000000003', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'Secret', 'سري', 2, true, null),
  ('aaaaaaaa-2b2b-4000-8000-000000000004', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'Gone', 'محذوف', 3, false, now()),
  ('bbbbbbbb-2b2b-4000-8000-000000000001', 'bbbbbbbb-1a1a-4000-8000-000000000000', 'B Mains', 'ب رئيسية', 0, false, null);

insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, description_en, description_ar, price_fils, sort_order, is_hidden, is_sold_out, deleted_at) values
  ('aaaaaaaa-3c3c-4000-8000-000000000001', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-2b2b-4000-8000-000000000001', 'Kebab', 'كباب', 'Grilled', 'مشوي', 4500, 0, false, false, null),
  ('aaaaaaaa-3c3c-4000-8000-000000000002', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-2b2b-4000-8000-000000000001', 'Tawook', 'طاووق', '', '', 4000, 1, false, true, null),
  ('aaaaaaaa-3c3c-4000-8000-000000000003', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-2b2b-4000-8000-000000000001', 'Hidden item', 'مخفي', '', '', 100, 2, true, false, null),
  ('aaaaaaaa-3c3c-4000-8000-000000000004', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-2b2b-4000-8000-000000000001', 'Deleted item', 'محذوف', '', '', 100, 3, false, false, now()),
  ('aaaaaaaa-3c3c-4000-8000-000000000005', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-2b2b-4000-8000-000000000002', 'Hummus', 'حمص', '', '', 1250, 0, false, false, null),
  ('aaaaaaaa-3c3c-4000-8000-000000000006', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-2b2b-4000-8000-000000000003', 'In secret category', 'في فئة سرية', '', '', 100, 0, false, false, null),
  ('bbbbbbbb-3c3c-4000-8000-000000000001', 'bbbbbbbb-1a1a-4000-8000-000000000000', 'bbbbbbbb-2b2b-4000-8000-000000000001', 'B Secret Dish', 'طبق ب', '', '', 999, 0, false, false, null);

-- Option groups: "Size" attached to Kebab (one live option, one deleted), "Old" deleted and attached, "Loose" not attached.
insert into public.option_groups (id, restaurant_id, name_en, name_ar, min_select, max_select, deleted_at) values
  ('aaaaaaaa-4d4d-4000-8000-000000000001', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'Size', 'الحجم', 1, 1, null),
  ('aaaaaaaa-4d4d-4000-8000-000000000002', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'Old', 'قديم', 0, 1, now()),
  ('aaaaaaaa-4d4d-4000-8000-000000000003', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'Loose', 'سائب', 0, 1, null);
insert into public.options (id, restaurant_id, group_id, name_en, name_ar, price_delta_fils, sort_order, deleted_at) values
  ('aaaaaaaa-5e5e-4000-8000-000000000001', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-4d4d-4000-8000-000000000001', 'Large', 'كبير', 500, 1, null),
  ('aaaaaaaa-5e5e-4000-8000-000000000002', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-4d4d-4000-8000-000000000001', 'Small', 'صغير', 0, 0, null),
  ('aaaaaaaa-5e5e-4000-8000-000000000003', 'aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-4d4d-4000-8000-000000000001', 'Removed', 'محذوف', 0, 2, now());
insert into public.menu_item_option_groups (restaurant_id, item_id, group_id, sort_order) values
  ('aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-3c3c-4000-8000-000000000001', 'aaaaaaaa-4d4d-4000-8000-000000000001', 0),
  ('aaaaaaaa-1a1a-4000-8000-000000000000', 'aaaaaaaa-3c3c-4000-8000-000000000001', 'aaaaaaaa-4d4d-4000-8000-000000000002', 1);

-- ── Anonymous visitor ──
set local role anon;

select is(
  (select array_agg(c ->> 'name_en' order by ord) from jsonb_array_elements(public.get_public_menu('pm-a')) with ordinality as t(c, ord)),
  array['Starters', 'Mains'],
  'only visible categories, in sort order (hidden and deleted ones are left out)');
select is(
  (select array_agg(i ->> 'name_en' order by ord)
   from jsonb_array_elements(public.get_public_menu('pm-a') -> 1 -> 'items') with ordinality as t(i, ord)),
  array['Kebab', 'Tawook'],
  'only visible items (hidden and deleted ones are left out), in sort order');
select is(
  (select (i ->> 'is_sold_out')::boolean from jsonb_array_elements(public.get_public_menu('pm-a') -> 1 -> 'items') as t(i) where i ->> 'name_en' = 'Tawook'),
  true, 'a sold-out item is shown, marked as sold out');
select is(
  (select count(*) from jsonb_array_elements(public.get_public_menu('pm-a')) as t(c), jsonb_array_elements(c -> 'items') as u(i)
   where i ->> 'name_en' = 'In secret category'),
  0::bigint, 'items of a hidden category are not shown');

-- Option groups: only attached, live groups with their live options (sorted).
select is(
  (select jsonb_array_length(i -> 'option_groups') from jsonb_array_elements(public.get_public_menu('pm-a') -> 1 -> 'items') as t(i) where i ->> 'name_en' = 'Kebab'),
  1, 'a deleted group is not offered, and an unattached one never shows');
select is(
  (select array_agg(o ->> 'name_en' order by ord)
   from jsonb_array_elements(public.get_public_menu('pm-a') -> 1 -> 'items' -> 0 -> 'option_groups' -> 0 -> 'options') with ordinality as t(o, ord)),
  array['Small', 'Large'], 'a deleted option is not offered; options are in sort order');
select is(
  (select (public.get_public_menu('pm-a') -> 1 -> 'items' -> 0 -> 'option_groups' -> 0 ->> 'min_select')::int),
  1, 'the selection rules come with the group');

-- Isolation and lookup rules.
select is((select count(*) from jsonb_array_elements(public.get_public_menu('pm-a')) as t(c), jsonb_array_elements(c -> 'items') as u(i)
           where i ->> 'name_en' = 'B Secret Dish'), 0::bigint, 'restaurant A''s menu never contains B''s dishes');
select is((select (public.get_public_menu('  PM-B ') -> 0 ->> 'name_en')), 'B Mains', 'slug lookup ignores case and spaces');
select is(public.get_public_menu('no-such-place'), '[]'::jsonb, 'unknown slug gives an empty menu');
select is(public.get_public_menu('%'), '[]'::jsonb, 'a wildcard slug lists nothing');

-- The exact keys: if this fails, someone widened the public surface. Review it.
select is(
  (select array(select jsonb_object_keys(public.get_public_menu('pm-a') -> 1 -> 'items' -> 0) order by 1)
         || array(select '|' || k from jsonb_object_keys(public.get_public_menu('pm-a') -> 1) as k order by 1)),
  array['description_ar', 'description_en', 'id', 'image_path', 'is_sold_out', 'name_ar', 'name_en', 'option_groups', 'price_fils', 'sort_order',
        '|id', '|items', '|name_ar', '|name_en', '|sort_order'],
  'item and category expose only the agreed keys');
select is(
  (select array(select jsonb_object_keys(public.get_public_menu('pm-a') -> 1 -> 'items' -> 0 -> 'option_groups' -> 0) order by 1)
         || array(select '|' || k from jsonb_object_keys(public.get_public_menu('pm-a') -> 1 -> 'items' -> 0 -> 'option_groups' -> 0 -> 'options' -> 0) as k order by 1)),
  array['id', 'max_select', 'min_select', 'name_ar', 'name_en', 'options', 'sort_order',
        '|id', '|name_ar', '|name_en', '|price_delta_fils', '|sort_order'],
  'option group and option expose only the agreed keys');

-- Still no direct table access for anon.
select throws_ok($$ select * from public.menu_items $$, '42501', null, 'anon still has no direct menu table access');

select * from finish();
rollback;
