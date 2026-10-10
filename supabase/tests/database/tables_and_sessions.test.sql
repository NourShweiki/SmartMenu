-- Tables with QR tokens and table sessions: tenant isolation, label/token rules, one live session per table, the session
-- lifecycle, orders belonging to an OPEN session, who may do what, and the public "scan a QR code" function.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'ts-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'ts-manager-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000f3', 'ts-waiter-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000f4', 'ts-cashier-a@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-6b6b-4000-8000-000000000000', 'ts-a', 'TS A', 'أ'),
  ('bbbbbbbb-6b6b-4000-8000-000000000000', 'ts-b', 'TS B', 'ب'),
  ('cccccccc-6b6b-4000-8000-000000000000', 'ts-c', 'TS C (dine-in off)', 'ج');
insert into public.restaurant_settings (restaurant_id, dine_in_enabled, takeout_enabled) values
  ('aaaaaaaa-6b6b-4000-8000-000000000000', true, true),
  ('bbbbbbbb-6b6b-4000-8000-000000000000', true, true),
  ('cccccccc-6b6b-4000-8000-000000000000', false, true);
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'OWNER'),
  ('aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f2', 'MANAGER'),
  ('aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f3', 'WAITER'),
  ('aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f4', 'CASHIER');

insert into public.restaurant_tables (id, restaurant_id, label, token, is_active, deleted_at) values
  ('aaaaaaaa-7c7c-4000-8000-000000000001', 'aaaaaaaa-6b6b-4000-8000-000000000000', 'Terrace', 'ts-token-a1-0000000000000001', true,  null),
  ('aaaaaaaa-7c7c-4000-8000-000000000002', 'aaaaaaaa-6b6b-4000-8000-000000000000', 'Two',     'ts-token-a2-0000000000000002', true,  null),
  ('aaaaaaaa-7c7c-4000-8000-000000000003', 'aaaaaaaa-6b6b-4000-8000-000000000000', 'Off',     'ts-token-a3-0000000000000003', false, null),
  ('aaaaaaaa-7c7c-4000-8000-000000000004', 'aaaaaaaa-6b6b-4000-8000-000000000000', 'Gone',    'ts-token-a4-0000000000000004', true,  now()),
  ('bbbbbbbb-7c7c-4000-8000-000000000001', 'bbbbbbbb-6b6b-4000-8000-000000000000', 'Terrace', 'ts-token-b1-0000000000000001', true,  null),
  ('cccccccc-7c7c-4000-8000-000000000001', 'cccccccc-6b6b-4000-8000-000000000000', '1',       'ts-token-c1-0000000000000001', true,  null);

-- ── Table rules (superuser) ──
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'terrace', 'ts-token-x1-0000000000000001') $$,
  '23505', null, 'a label is unique per restaurant ignoring case');
select lives_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('bbbbbbbb-6b6b-4000-8000-000000000000', 'Terrace 2', 'ts-token-x2-0000000000000002') $$,
  'the same kind of label is fine in another restaurant');
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'Two  spaces', 'ts-token-x3-0000000000000003') $$,
  '23514', null, 'a label must be tidy (no doubled spaces)');
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', E'tab\there', 'ts-token-x4-0000000000000004') $$,
  '23514', null, 'a label cannot contain control characters');
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', '<b>', 'ts-token-x5-0000000000000005') $$,
  '23514', null, 'a label cannot contain markup characters');
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'Weak', 'short') $$,
  '23514', null, 'a token must be long and URL-safe (128 bits)');
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('bbbbbbbb-6b6b-4000-8000-000000000000', 'Dup', 'ts-token-a1-0000000000000001') $$,
  '23505', null, 'a token is unique across all restaurants');
select lives_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'Gone', 'ts-token-x6-0000000000000006') $$,
  'a soft-deleted table frees its label');

-- ── Session rules (superuser) ──
insert into public.table_sessions (id, restaurant_id, table_id) values
  ('aaaaaaaa-8d8d-4000-8000-000000000001', 'aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-7c7c-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.table_sessions (restaurant_id, table_id) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-7c7c-4000-8000-000000000001') $$,
  '23505', null, 'a table has at most one live session');
select throws_ok(
  $$ insert into public.table_sessions (restaurant_id, table_id) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'bbbbbbbb-7c7c-4000-8000-000000000001') $$,
  '23503', null, 'a session cannot point at another restaurant''s table (composite FK)');
select throws_ok(
  $$ insert into public.table_sessions (restaurant_id, table_id, status) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-7c7c-4000-8000-000000000002', 'CLOSED') $$,
  '23514', null, 'a CLOSED session needs an end time');

update public.table_sessions set status = 'PAYMENT_REQUESTED' where id = 'aaaaaaaa-8d8d-4000-8000-000000000001';
select is((select ended_at is null from public.table_sessions where id = 'aaaaaaaa-8d8d-4000-8000-000000000001'), true,
  'OPEN -> PAYMENT_REQUESTED works and the session is not ended');
select throws_ok(
  $$ update public.table_sessions set status = 'OPEN' where id = 'aaaaaaaa-8d8d-4000-8000-000000000001' $$,
  '23514', null, 'a session never goes back to OPEN');
update public.table_sessions set status = 'CLOSED' where id = 'aaaaaaaa-8d8d-4000-8000-000000000001';
select is((select ended_at is not null from public.table_sessions where id = 'aaaaaaaa-8d8d-4000-8000-000000000001'), true,
  'closing a session stamps its end time');
select throws_ok(
  $$ update public.table_sessions set status = 'PAYMENT_REQUESTED' where id = 'aaaaaaaa-8d8d-4000-8000-000000000001' $$,
  '23514', null, 'nothing happens after CLOSED');

-- ── Orders need an OPEN session of their own restaurant ──
select throws_ok(
  $$ insert into public.orders (restaurant_id, session_id, number, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
     values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-8d8d-4000-8000-000000000001', 1, 0, 0, 0, 0, 0, 0) $$,
  '23514', null, 'an order cannot be placed in a CLOSED session');
select throws_ok(
  $$ insert into public.orders (restaurant_id, session_id, number, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
     values ('bbbbbbbb-6b6b-4000-8000-000000000000', 'aaaaaaaa-8d8d-4000-8000-000000000001', 1, 0, 0, 0, 0, 0, 0) $$,
  '23514', null, 'an order cannot use another restaurant''s session');

-- A fresh OPEN session on Terrace (the old one is closed) and one on table Two, for the role tests.
insert into public.table_sessions (id, restaurant_id, table_id) values
  ('aaaaaaaa-8d8d-4000-8000-000000000002', 'aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-7c7c-4000-8000-000000000001'),
  ('aaaaaaaa-8d8d-4000-8000-000000000003', 'aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-7c7c-4000-8000-000000000002');

-- ── Owner of A ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f1","role":"authenticated"}';
select is((select count(*) from public.restaurant_tables), 5::bigint, 'owner A sees only A''s tables (incl. the inactive, the deleted and the re-used label)');
select is((select count(*) from public.table_sessions), 3::bigint, 'owner A sees only A''s sessions');
select lives_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'Patio', 'ts-token-a9-0000000000000009') $$,
  'owner A can add a table');
select lives_ok($$ update public.restaurant_tables set label = 'Patio 1' where label = 'Patio' $$, 'owner A can rename a table');
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('bbbbbbbb-6b6b-4000-8000-000000000000', 'Hacked', 'ts-token-b9-0000000000000009') $$,
  '42501', null, 'owner A cannot add a table to B');
select throws_ok(
  $$ update public.restaurant_tables set restaurant_id = 'bbbbbbbb-6b6b-4000-8000-000000000000' where label = 'Patio 1' $$,
  '42501', null, 'a table cannot be moved to another restaurant (column grant)');
select throws_ok(
  $$ delete from public.restaurant_tables where label = 'Patio 1' $$, '42501', null, 'tables are soft-deleted, never hard-deleted');
select throws_ok(
  $$ insert into public.table_sessions (restaurant_id, table_id) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'aaaaaaaa-7c7c-4000-8000-000000000003') $$,
  '42501', null, 'staff cannot create sessions directly (customers do, by scanning)');

-- ── Manager of A: manages tables, can issue a new QR code ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f2","role":"authenticated"}';
select lives_ok(
  $$ update public.restaurant_tables set token = 'ts-token-a1-new-000000000000001' where label = 'Terrace' and restaurant_id = 'aaaaaaaa-6b6b-4000-8000-000000000000' $$,
  'a manager can give a table a new QR token');

-- ── Waiter of A: reads tables, signals "ready to pay", cannot close ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f3","role":"authenticated"}';
select is((select count(*) from public.restaurant_tables), 6::bigint, 'a waiter can read all of A''s tables (and none of B''s)');
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'Waiter', 'ts-token-aw-0000000000000001') $$,
  '42501', null, 'a waiter cannot add tables');
select lives_ok(
  $$ update public.table_sessions set status = 'PAYMENT_REQUESTED' where id = 'aaaaaaaa-8d8d-4000-8000-000000000002' $$,
  'a waiter can signal that a table is ready to pay');
select throws_ok(
  $$ update public.table_sessions set status = 'CLOSED' where id = 'aaaaaaaa-8d8d-4000-8000-000000000002' $$,
  '42501', null, 'a waiter cannot close a session (that is the cashier''s step)');

-- ── Cashier of A: closes after payment, cannot signal payment or manage tables ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f4","role":"authenticated"}';
select throws_ok(
  $$ update public.table_sessions set status = 'PAYMENT_REQUESTED' where id = 'aaaaaaaa-8d8d-4000-8000-000000000003' $$,
  '42501', null, 'a cashier cannot signal payment');
select lives_ok(
  $$ update public.table_sessions set status = 'CLOSED' where id = 'aaaaaaaa-8d8d-4000-8000-000000000002' $$,
  'a cashier can close a session that asked for payment');
select throws_ok(
  $$ insert into public.restaurant_tables (restaurant_id, label, token) values ('aaaaaaaa-6b6b-4000-8000-000000000000', 'Cashier', 'ts-token-ac-0000000000000001') $$,
  '42501', null, 'a cashier cannot add tables');

-- ── Anonymous visitor scans a QR code ──
reset role;
set local role anon;
select is((public.join_table_session('ts-a', 'ts-token-a2-0000000000000002') ->> 'session_id')::uuid, 'aaaaaaaa-8d8d-4000-8000-000000000003'::uuid,
  'scanning a table that has a live session joins that session (shared by every device)');
select is(public.join_table_session('ts-a', 'ts-token-a2-0000000000000002') ->> 'table_label', 'Two', 'the answer carries the table label');
select is(public.join_table_session('ts-a', 'ts-token-a1-0000000000000001'), null::jsonb, 'the OLD token of a regenerated table no longer works');
select isnt(public.join_table_session('ts-a', 'ts-token-a1-new-000000000000001') ->> 'session_id', null,
  'the NEW token works, and starts a fresh session (the old one was closed)');
select is(public.join_table_session('ts-a', 'ts-token-a1-new-000000000000001') ->> 'session_id',
          public.join_table_session('ts-a', 'ts-token-a1-new-000000000000001') ->> 'session_id', 'scanning twice joins the same new session');
select is(public.join_table_session('ts-b', 'ts-token-a2-0000000000000002'), null::jsonb, 'a token of restaurant A does not work on restaurant B''s address');
select is(public.join_table_session('ts-a', 'ts-token-a3-0000000000000003'), null::jsonb, 'an inactive table cannot be scanned');
select is(public.join_table_session('ts-a', 'ts-token-a4-0000000000000004'), null::jsonb, 'a deleted table cannot be scanned');
select is(public.join_table_session('ts-c', 'ts-token-c1-0000000000000001'), null::jsonb, 'a restaurant with dine-in switched off gives no sessions');
select is(public.join_table_session('ts-a', 'not-a-token'), null::jsonb, 'a made-up token gives nothing');
select is((select array(select jsonb_object_keys(public.join_table_session('ts-a', 'ts-token-a2-0000000000000002')) order by 1)),
          array['session_id', 'status', 'table_label'], 'the scan exposes only the session id, the label and the status');
select is(public.get_public_session('ts-b', 'aaaaaaaa-8d8d-4000-8000-000000000003'), null::jsonb, 'a session id does not work on another restaurant''s address');
select throws_ok($$ select * from public.restaurant_tables $$, '42501', null, 'anonymous visitors have no direct table access');

select * from finish();
rollback;
