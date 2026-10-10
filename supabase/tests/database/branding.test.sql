-- Branding: only the OWNER may change the name / branding / logo, only for their own restaurant; the branding
-- data is kept small and the logo inside its own folder; saving name + branding is atomic; everyone can read it
-- through the public function. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'br-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000b2', 'br-manager-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000b3', 'br-waiter-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000b4', 'br-owner-c@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-0a0a-4000-8000-000000000000', 'br-a', 'BR A', 'أ'),
  ('bbbbbbbb-0a0a-4000-8000-000000000000', 'br-b', 'BR B', 'ب'),
  ('cccccccc-0a0a-4000-8000-000000000000', 'br-c', 'BR C original', 'ج');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-0a0a-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'OWNER'),
  ('aaaaaaaa-0a0a-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000b2', 'MANAGER'),
  ('aaaaaaaa-0a0a-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000b3', 'WAITER'),
  ('cccccccc-0a0a-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000b4', 'OWNER');
-- A and B have settings (default branding {}). C deliberately has NONE, to prove a failed save rolls the name back.
insert into public.restaurant_settings (restaurant_id) values
  ('aaaaaaaa-0a0a-4000-8000-000000000000'),
  ('bbbbbbbb-0a0a-4000-8000-000000000000');

-- ── Schema guards (superuser) ──
select is((select public from storage.buckets where id = 'restaurant-logos'), true, 'restaurant-logos bucket is public (view only)');
select throws_ok(
  $$ update public.restaurant_settings set branding = '[]'::jsonb where restaurant_id = 'aaaaaaaa-0a0a-4000-8000-000000000000' $$,
  '23514', null, 'branding must be a json object');
select throws_ok(
  $$ update public.restaurant_settings set branding = jsonb_build_object('logoPath', 'bbbbbbbb-0a0a-4000-8000-000000000000/logo.png')
     where restaurant_id = 'aaaaaaaa-0a0a-4000-8000-000000000000' $$,
  '23514', null, 'the logo must be inside the restaurant''s own folder');
select throws_ok(
  $$ update public.restaurant_settings set branding = jsonb_build_object('about', repeat('x', 9000))
     where restaurant_id = 'aaaaaaaa-0a0a-4000-8000-000000000000' $$,
  '23514', null, 'branding cannot be huge');

-- ── Owner of A ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000b1","role":"authenticated"}';

select is(
  public.update_restaurant_branding('aaaaaaaa-0a0a-4000-8000-000000000000', 'New EN', 'جديد',
    '{"accent":"teal","tagline":{"en":"Hello","ar":"مرحبا"}}'::jsonb),
  true, 'owner A saves name + branding');
select results_eq(
  $$ select r.name_en, s.branding ->> 'accent' from public.restaurants r
     join public.restaurant_settings s on s.restaurant_id = r.id where r.id = 'aaaaaaaa-0a0a-4000-8000-000000000000' $$,
  $$ values ('New EN'::text, 'teal'::text) $$,
  'the name and the branding were both saved');
select is(
  public.update_restaurant_branding('bbbbbbbb-0a0a-4000-8000-000000000000', 'Hacked', 'مخترق', '{"accent":"red"}'::jsonb),
  false, 'owner A cannot save branding for restaurant B');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('restaurant-logos', 'bbbbbbbb-0a0a-4000-8000-000000000000/logo-1.png') $$,
  '42501', null, 'owner A cannot upload a logo into B''s folder');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('restaurant-logos', 'aaaaaaaa-0a0a-4000-8000-000000000000/logo-1.png') $$,
  'owner A can upload a logo into A''s folder');

-- ── Manager of A: can run the menu, but branding is the owner's ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000b2","role":"authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('restaurant-logos', 'aaaaaaaa-0a0a-4000-8000-000000000000/logo-2.png') $$,
  '42501', null, 'a manager cannot upload a logo');
select is(
  public.update_restaurant_branding('aaaaaaaa-0a0a-4000-8000-000000000000', 'Manager', 'مدير', '{"accent":"red"}'::jsonb),
  false, 'a manager cannot save branding');

-- ── Waiter of A ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000b3","role":"authenticated"}';
select is(
  public.update_restaurant_branding('aaaaaaaa-0a0a-4000-8000-000000000000', 'Waiter', 'نادل', '{"accent":"red"}'::jsonb),
  false, 'a waiter cannot save branding');

-- ── Atomic: owner of C has no settings row, so the branding half fails and the name change must be undone ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000b4","role":"authenticated"}';
select throws_ok(
  $$ select public.update_restaurant_branding('cccccccc-0a0a-4000-8000-000000000000', 'Changed', 'تغيّر', '{}'::jsonb) $$,
  '42501', null, 'a failed branding save raises an error');

-- ── Verify (superuser) ──
reset role;
select is((select name_en from public.restaurants where id = 'cccccccc-0a0a-4000-8000-000000000000'), 'BR C original',
  'the name change was rolled back with the failed branding save');
select results_eq(
  $$ select r.name_en, s.branding from public.restaurants r join public.restaurant_settings s on s.restaurant_id = r.id
     where r.id = 'bbbbbbbb-0a0a-4000-8000-000000000000' $$,
  $$ values ('BR B'::text, '{}'::jsonb) $$,
  'restaurant B is untouched by A''s staff');

-- ── Public read ──
set local role anon;
select is((select branding ->> 'accent' from public.get_public_restaurant('br-a')), 'teal',
  'anyone can read a restaurant''s branding through the public function');
select throws_ok(
  $$ select public.update_restaurant_branding('aaaaaaaa-0a0a-4000-8000-000000000000', 'x', 'x', '{}'::jsonb) $$,
  '42501', null, 'anonymous visitors cannot call the save function');

select * from finish();
rollback;
