-- The AI ordering chat as a per-restaurant setting (migration ordering_assistant_setting, PROJECT_SPEC.md §3.3):
-- off by default, visible through the public read, changed by the owner only, and only for their own restaurant.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Fixtures (as superuser): two restaurants, an owner and a manager at A.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'assistant-owner@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'assistant-manager@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-7777-4000-8000-000000000000', 'assistant-a', 'Assistant A', 'مساعد أ'),
  ('bbbbbbbb-7777-4000-8000-000000000000', 'assistant-b', 'Assistant B', 'مساعد ب');
insert into public.restaurant_settings (restaurant_id) values
  ('aaaaaaaa-7777-4000-8000-000000000000'),
  ('bbbbbbbb-7777-4000-8000-000000000000');
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'OWNER'),
  ('aaaaaaaa-7777-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'MANAGER');

select is((select ordering_assistant_enabled from public.restaurant_settings where restaurant_id = 'aaaaaaaa-7777-4000-8000-000000000000'),
  false, 'a new restaurant starts with the AI chat off');

-- The public read (home and menu pages, no sign-in) carries it.
set local role anon;
select is((select ordering_assistant_enabled from public.get_public_restaurant('assistant-a')), false,
  'anon sees through the public read that the chat is off');

-- The owner switches it on, for their own restaurant only.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$ update public.restaurant_settings set ordering_assistant_enabled = true where restaurant_id = 'aaaaaaaa-7777-4000-8000-000000000000' $$,
  'the owner can switch the chat on');
update public.restaurant_settings set ordering_assistant_enabled = true where restaurant_id = 'bbbbbbbb-7777-4000-8000-000000000000';

-- A manager cannot (settings are the owner's, role.ts restaurant:settings).
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a2","role":"authenticated"}';
update public.restaurant_settings set ordering_assistant_enabled = false where restaurant_id = 'aaaaaaaa-7777-4000-8000-000000000000';

reset role;
select is((select ordering_assistant_enabled from public.restaurant_settings where restaurant_id = 'aaaaaaaa-7777-4000-8000-000000000000'),
  true, 'the owner''s change is stored, and the manager''s attempt to switch it off changed nothing');
select is((select ordering_assistant_enabled from public.restaurant_settings where restaurant_id = 'bbbbbbbb-7777-4000-8000-000000000000'),
  false, 'the owner of A cannot switch it on at another restaurant');

set local role anon;
select is((select ordering_assistant_enabled from public.get_public_restaurant('assistant-a')), true,
  'the public read shows the new value');
select throws_ok($$ update public.restaurant_settings set ordering_assistant_enabled = true $$, '42501', null,
  'anon cannot change it');

-- The demo seed: on at Demo Grill (its assistant tests), off at Demo Coffee (a coffee shop, like every new one).
reset role;
select results_eq(
  $$ select r.slug, s.ordering_assistant_enabled from public.restaurants r join public.restaurant_settings s on s.restaurant_id = r.id
     where r.slug in ('demo-dinein', 'demo-takeout') order by r.slug $$,
  $$ values ('demo-dinein'::text, true), ('demo-takeout'::text, false) $$,
  'demo seed: chat on at Demo Grill, off at Demo Coffee');

select * from finish();
rollback;
