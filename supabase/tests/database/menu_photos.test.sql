-- Proves only a restaurant's owner/manager can write photos, and only into its own folder.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'photo-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'photo-waiter-a@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-5555-4000-8000-000000000000', 'photo-a', 'Photo A', 'صور أ'),
  ('bbbbbbbb-5555-4000-8000-000000000000', 'photo-b', 'Photo B', 'صور ب');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-5555-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'OWNER'),
  ('aaaaaaaa-5555-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c2', 'WAITER');
insert into public.menu_categories (id, restaurant_id, name_en, name_ar) values
  ('aaaaaaaa-6666-4000-8000-000000000000', 'aaaaaaaa-5555-4000-8000-000000000000', 'Cat', 'فئة');
insert into public.menu_items (id, restaurant_id, category_id, name_en, name_ar, price_fils) values
  ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-5555-4000-8000-000000000000', 'aaaaaaaa-6666-4000-8000-000000000000', 'Item', 'صنف', 100);

-- ── Schema guards (superuser) ──
select is((select public from storage.buckets where id = 'menu-images'), true, 'menu-images bucket is public (view only)');
select throws_ok(
  $$ update public.menu_items set image_path = 'bbbbbbbb-5555-4000-8000-000000000000/x/y.jpg'
     where id = 'aaaaaaaa-7777-4000-8000-000000000000' $$,
  '23514', null, 'image_path must be inside the item''s own restaurant/item folder');

-- ── Owner of A ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('menu-images', 'aaaaaaaa-5555-4000-8000-000000000000/aaaaaaaa-7777-4000-8000-000000000000/p1.jpg') $$,
  'owner A can upload into A''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('menu-images', 'bbbbbbbb-5555-4000-8000-000000000000/x/p1.jpg') $$,
  '42501', null, 'owner A cannot upload into B''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('menu-images', 'not-a-restaurant/p1.jpg') $$,
  '42501', null, 'junk folder names are refused');
select lives_ok(
  $$ update public.menu_items
     set image_path = 'aaaaaaaa-5555-4000-8000-000000000000/aaaaaaaa-7777-4000-8000-000000000000/p1.jpg'
     where id = 'aaaaaaaa-7777-4000-8000-000000000000' $$,
  'owner A can set the item''s image_path');

-- ── Waiter of A ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c2","role":"authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('menu-images', 'aaaaaaaa-5555-4000-8000-000000000000/aaaaaaaa-7777-4000-8000-000000000000/p2.jpg') $$,
  '42501', null, 'waiter cannot upload photos');
-- Same path the Storage API takes for deletes (it sets this flag); RLS then decides which rows.
set local storage.allow_delete_query = 'true';
delete from storage.objects where name like 'aaaaaaaa-5555-4000-8000-000000000000/%';

-- ── Verify (superuser) ──
reset role;
select is((select count(*) from storage.objects where name like 'aaaaaaaa-5555-4000-8000-000000000000/%'), 1::bigint,
  'waiter could not delete the owner''s photo');
select is((select count(*) from storage.objects where name like 'bbbbbbbb-5555-4000-8000-000000000000/%'), 0::bigint,
  'nothing was written into B''s folder');

select * from finish();
rollback;
