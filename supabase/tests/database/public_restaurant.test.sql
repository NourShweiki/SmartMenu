-- Proves the public read path returns exactly one restaurant's safe fields and nothing else.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Fixtures (as superuser)
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-1111-4000-8000-000000000000', 'test-a', 'Test A', 'تجربة أ'),
  ('bbbbbbbb-1111-4000-8000-000000000000', 'test-b', 'Test B', 'تجربة ب');
insert into public.restaurant_settings (restaurant_id, service_charge_bp) values
  ('aaaaaaaa-1111-4000-8000-000000000000', 1000),
  ('bbbbbbbb-1111-4000-8000-000000000000', 0);

-- The exact public column list. If this fails, someone widened the public surface: review it.
select is(
  (select p.proargnames[2:]::text[] from pg_proc p where p.proname = 'get_public_restaurant'),
  array['id', 'slug', 'name_en', 'name_ar', 'dine_in_enabled', 'takeout_enabled',
        'delivery_enabled', 'tax_rate_bp', 'service_charge_bp', 'default_language', 'branding'],
  'public function exposes only the agreed columns');

-- ── Act as anonymous visitor ──
set local role anon;

select results_eq(
  $$ select id, name_en, name_ar, service_charge_bp from public.get_public_restaurant('test-a') $$,
  $$ values ('aaaaaaaa-1111-4000-8000-000000000000'::uuid, 'Test A', 'تجربة أ', 1000) $$,
  'anon gets restaurant A by slug');
select is((select count(*) from public.get_public_restaurant('test-a')), 1::bigint,
  'lookup returns only the requested restaurant');
select is((select count(*) from public.get_public_restaurant('  TEST-B ')), 1::bigint,
  'slug lookup ignores case and surrounding spaces');
select is((select count(*) from public.get_public_restaurant('no-such-place')), 0::bigint,
  'unknown slug returns nothing');
select is((select count(*) from public.get_public_restaurant('%')), 0::bigint,
  'wildcard slug does not list restaurants');
select throws_ok($$ select * from public.restaurant_settings $$, '42501', null,
  'anon still has no direct settings access');

-- ── Logged-in staff can use the same public path ──
reset role;
set local role authenticated;
select is((select count(*) from public.get_public_restaurant('test-b')), 1::bigint,
  'authenticated can call the public function');

select * from finish();
rollback;
