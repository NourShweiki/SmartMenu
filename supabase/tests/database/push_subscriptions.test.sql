-- Web push W2 (docs/WEB_PUSH_PLAN.md): where to send "your order is ready" when the guest's page is closed.
-- A guest saves a subscription for their own live visit only (public function), at most 5 per visit, only to a known
-- push service. Staff who may move an order read the subscriptions of that order's visit once it is READY, and remove
-- one the push service says is gone. Nobody reads or writes the table directly; restaurant B never sees A's rows.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'ps-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'ps-waiter-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000f3', 'ps-cashier-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000f4', 'ps-owner-b@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-6e6e-4000-8000-000000000000', 'ps-a', 'PS A', 'أ'),
  ('bbbbbbbb-6e6e-4000-8000-000000000000', 'ps-b', 'PS B', 'ب');
insert into public.restaurant_settings (restaurant_id, dine_in_enabled, takeout_enabled) values
  ('aaaaaaaa-6e6e-4000-8000-000000000000', true, true),
  ('bbbbbbbb-6e6e-4000-8000-000000000000', true, true);
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'OWNER'),
  ('aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f2', 'WAITER'),
  ('aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f3', 'CASHIER'),
  ('bbbbbbbb-6e6e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000f4', 'OWNER');

insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('aaaaaaaa-6f6f-4000-8000-000000000001', 'aaaaaaaa-6e6e-4000-8000-000000000000', '1', 'ps-token-a1-0000000000000001'),
  ('aaaaaaaa-6f6f-4000-8000-000000000002', 'aaaaaaaa-6e6e-4000-8000-000000000000', '2', 'ps-token-a2-0000000000000002'),
  ('aaaaaaaa-6f6f-4000-8000-000000000003', 'aaaaaaaa-6e6e-4000-8000-000000000000', '3', 'ps-token-a3-0000000000000003'),
  ('bbbbbbbb-6f6f-4000-8000-000000000001', 'bbbbbbbb-6e6e-4000-8000-000000000000', '1', 'ps-token-b1-0000000000000001');

-- V1 live table visit, V2 OPEN but started 3 hours ago (expired), V3 closed, V4 a takeout visit, VB restaurant B's live visit.
insert into public.table_sessions (id, restaurant_id, table_id, status, started_at, ended_at) values
  ('aaaaaaaa-6d6d-4000-8000-000000000001', 'aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-6f6f-4000-8000-000000000001', 'OPEN', now(), null),
  ('aaaaaaaa-6d6d-4000-8000-000000000002', 'aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-6f6f-4000-8000-000000000002', 'OPEN', now() - interval '3 hours', null),
  ('aaaaaaaa-6d6d-4000-8000-000000000003', 'aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-6f6f-4000-8000-000000000003', 'CLOSED', now(), now()),
  ('bbbbbbbb-6d6d-4000-8000-000000000001', 'bbbbbbbb-6e6e-4000-8000-000000000000', 'bbbbbbbb-6f6f-4000-8000-000000000001', 'OPEN', now(), null);
insert into public.table_sessions (id, restaurant_id, kind, customer_name, customer_phone) values
  ('aaaaaaaa-6d6d-4000-8000-000000000004', 'aaaaaaaa-6e6e-4000-8000-000000000000', 'PICKUP', 'Sara', '+962791234567');

-- O1 READY at the table (V1), O2 PREPARING at the table (V1), O4 READY takeout (V4), OB READY at restaurant B (VB).
insert into public.orders (id, restaurant_id, session_id, number, status, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp) values
  ('aaaaaaaa-6c6c-4000-8000-000000000001', 'aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-6d6d-4000-8000-000000000001', 1, 'READY', 1000, 0, 0, 1000, 0, 0),
  ('aaaaaaaa-6c6c-4000-8000-000000000002', 'aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-6d6d-4000-8000-000000000001', 2, 'PREPARING', 1000, 0, 0, 1000, 0, 0),
  ('aaaaaaaa-6c6c-4000-8000-000000000004', 'aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-6d6d-4000-8000-000000000004', 3, 'READY', 1000, 0, 0, 1000, 0, 0),
  ('bbbbbbbb-6c6c-4000-8000-000000000001', 'bbbbbbbb-6e6e-4000-8000-000000000000', 'bbbbbbbb-6d6d-4000-8000-000000000001', 1, 'READY', 1000, 0, 0, 1000, 0, 0);

-- Keys as browsers give them (see src/domain/table-session/push-subscription.test.ts). Helpers live in public only for
-- this test (anon cannot use pg_temp); the transaction is rolled back at the end, so they never stay.
create function public.ps_test_k() returns text language sql as $$ select 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM' $$;
create function public.ps_test_a() returns text language sql as $$ select 'tBHItJI5svbpez7KI4CCXg' $$;
create function public.ps_test_save(p_slug text, p_session uuid, p_endpoint text, p_locale text default 'en') returns jsonb language sql as $$
  select public.save_push_subscription(p_slug, p_session, p_endpoint, public.ps_test_k(), public.ps_test_a(), p_locale) $$;
create function public.ps_test_id(p_endpoint text) returns uuid language sql security definer set search_path = '' as 'select id from public.push_subscriptions where endpoint = p_endpoint';
grant execute on function public.ps_test_id(text) to authenticated;
grant execute on function public.ps_test_k(), public.ps_test_a(), public.ps_test_save(text, uuid, text, text) to anon, authenticated;

-- ── A guest saves (as anon: no login) ──
set local role anon;
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/one') ->> 'ok', 'true', 'a guest at a live table saves a subscription');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/one', 'ar') ->> 'ok', 'true', 'saving the same address again is fine (keys and language are refreshed)');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://web.push.apple.com/two') ->> 'ok', 'true', 'a second phone at the same table');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000004', 'https://updates.push.services.mozilla.com/wpush/v2/three') ->> 'ok', 'true', 'a takeout customer saves one too');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000003', 'https://fcm.googleapis.com/fcm/send/x') ->> 'error', 'SESSION_ENDED', 'a closed visit takes no subscription');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000002', 'https://fcm.googleapis.com/fcm/send/x') ->> 'error', 'SESSION_ENDED', 'a table visit past its 2 hours takes none, though it still says OPEN');
select is(public.ps_test_save('ps-b', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/x'), null, 'another restaurant''s slug cannot reach this visit');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-0000000000ff', 'https://fcm.googleapis.com/fcm/send/x'), null, 'an unknown visit gives nothing');

-- The address and keys are checked again here (the database never trusts the app; SSRF guard).
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://example.com/push') ->> 'error', 'INVALID_SUBSCRIPTION', 'an address that is not a push service is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com.evil.com/x') ->> 'error', 'INVALID_SUBSCRIPTION', 'a look-alike host is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://notfcm.googleapis.com/x') ->> 'error', 'INVALID_SUBSCRIPTION', 'a host that only ends in the same letters is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'http://fcm.googleapis.com/fcm/send/x') ->> 'error', 'INVALID_SUBSCRIPTION', 'plain http is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com:8443/x') ->> 'error', 'INVALID_SUBSCRIPTION', 'another port is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://user@fcm.googleapis.com/x') ->> 'error', 'INVALID_SUBSCRIPTION', 'a user name in the address is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://FCM.googleapis.com/x') ->> 'error', 'INVALID_SUBSCRIPTION', 'an address not in normalized form (upper-case host) is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', E'https://fcm.googleapis.com/x\ty') ->> 'error', 'INVALID_SUBSCRIPTION', 'a tab in the address is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/' || repeat('a', 1024)) ->> 'error', 'INVALID_SUBSCRIPTION', 'an address over 1024 characters is refused');
select is(public.save_push_subscription('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/x', 'A' || substr(public.ps_test_k(), 2), public.ps_test_a(), 'en') ->> 'error', 'INVALID_SUBSCRIPTION', 'a key that is not the browser''s point is refused');
select is(public.save_push_subscription('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/x', public.ps_test_k(), 'short', 'en') ->> 'error', 'INVALID_SUBSCRIPTION', 'an auth secret of the wrong size is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/x', 'fr') ->> 'error', 'INVALID_SUBSCRIPTION', 'a language other than ar / en is refused');

-- At most 5 per visit (V1 has 2 now).
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/c3') ->> 'ok', 'true', 'third');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/c4') ->> 'ok', 'true', 'fourth');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/c5') ->> 'ok', 'true', 'fifth');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/c6') ->> 'error', 'TOO_MANY', 'a sixth phone for one visit is refused');
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/c5') ->> 'ok', 'true', 'one already saved can still be refreshed at the cap');

-- A guest cannot touch the table or the staff functions.
select throws_ok($$ select count(*) from public.push_subscriptions $$, '42501', null, 'a guest cannot read the table');
select throws_ok($$ select public.push_subscriptions_for_order('aaaaaaaa-6c6c-4000-8000-000000000001') $$, '42501', null, 'a guest cannot list an order''s subscriptions');

-- ── Staff read them when the order is READY ──
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-4000-8000-0000000000f2", "role": "authenticated"}';
select is(jsonb_array_length(public.push_subscriptions_for_order('aaaaaaaa-6c6c-4000-8000-000000000001')), 5, 'the waiter gets the 5 subscriptions of a READY table order''s visit');
select is((public.push_subscriptions_for_order('aaaaaaaa-6c6c-4000-8000-000000000001') -> 0) ?& array['id', 'endpoint', 'p256dh', 'auth', 'locale'], true, 'each with its address, keys and language');
select is(public.push_subscriptions_for_order('aaaaaaaa-6c6c-4000-8000-000000000002'), '[]'::jsonb, 'nothing for an order that is not READY');
select is(jsonb_array_length(public.push_subscriptions_for_order('aaaaaaaa-6c6c-4000-8000-000000000004')), 1, 'the waiter gets the takeout order''s too');
select is(public.push_subscriptions_for_order('bbbbbbbb-6c6c-4000-8000-000000000001'), '[]'::jsonb, 'nothing of another restaurant''s order');
select throws_ok($$ select count(*) from public.push_subscriptions $$, '42501', null, 'staff cannot read the table directly');

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-4000-8000-0000000000f3", "role": "authenticated"}';
select is(public.push_subscriptions_for_order('aaaaaaaa-6c6c-4000-8000-000000000001'), '[]'::jsonb, 'the cashier does not move table orders, so gets nothing for one');
select is(jsonb_array_length(public.push_subscriptions_for_order('aaaaaaaa-6c6c-4000-8000-000000000004')), 1, 'the cashier moves takeout orders, so gets the takeout one');

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-4000-8000-0000000000f4", "role": "authenticated"}';
select is(public.push_subscriptions_for_order('aaaaaaaa-6c6c-4000-8000-000000000001'), '[]'::jsonb, 'restaurant B''s owner gets nothing of restaurant A');
select is(public.remove_push_subscription(public.ps_test_id('https://web.push.apple.com/two')), false, 'restaurant B''s owner cannot remove A''s subscription');

-- A subscription the push service says is gone is removed by staff of that restaurant.
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-4000-8000-0000000000f2", "role": "authenticated"}';
select is(public.remove_push_subscription(public.ps_test_id('https://web.push.apple.com/two')), true, 'the waiter removes a gone subscription');

-- ── When the visit closes, its subscriptions go with it ──
-- (V5: a live table visit without orders, so it may be closed.)
reset role;
insert into public.table_sessions (id, restaurant_id, table_id, status, started_at) values
  ('aaaaaaaa-6d6d-4000-8000-000000000005', 'aaaaaaaa-6e6e-4000-8000-000000000000', 'aaaaaaaa-6f6f-4000-8000-000000000003', 'OPEN', now());
select is(public.ps_test_save('ps-a', 'aaaaaaaa-6d6d-4000-8000-000000000005', 'https://fcm.googleapis.com/fcm/send/v5') ->> 'ok', 'true', 'V5 saves one');
update public.table_sessions set status = 'CLOSED', ended_at = now() where id = 'aaaaaaaa-6d6d-4000-8000-000000000005';
select is((select count(*)::int from public.push_subscriptions where session_id = 'aaaaaaaa-6d6d-4000-8000-000000000005'), 0, 'closing the visit deletes its subscriptions');
select is((select count(*)::int from public.push_subscriptions where session_id = 'aaaaaaaa-6d6d-4000-8000-000000000001'), 4, 'other visits keep theirs');

select * from finish();
rollback;
