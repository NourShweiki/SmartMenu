-- Guest service requests (call the waiter, clean the table, ask for the bill): the public function applies the domain
-- rules, tenant isolation, who may read and resolve (owner, manager, waiter: NOT the cashier), and the lifecycle.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'sr-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'sr-manager-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e3', 'sr-waiter-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e4', 'sr-cashier-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e5', 'sr-waiter-b@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e6', 'sr-owner-b@test.local');
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-5e5e-4000-8000-000000000000', 'sr-a', 'SR A', 'أ'),
  ('bbbbbbbb-5e5e-4000-8000-000000000000', 'sr-b', 'SR B', 'ب');
insert into public.restaurant_settings (restaurant_id, dine_in_enabled, takeout_enabled) values
  ('aaaaaaaa-5e5e-4000-8000-000000000000', true, true),
  ('bbbbbbbb-5e5e-4000-8000-000000000000', true, true);
insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'OWNER'),
  ('aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'MANAGER'),
  ('aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e3', 'WAITER'),
  ('aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e4', 'CASHIER'),
  ('bbbbbbbb-5e5e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e5', 'WAITER'),
  ('bbbbbbbb-5e5e-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e6', 'OWNER');

insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('aaaaaaaa-5f5f-4000-8000-000000000001', 'aaaaaaaa-5e5e-4000-8000-000000000000', '1', 'sr-token-a1-0000000000000001'),
  ('aaaaaaaa-5f5f-4000-8000-000000000002', 'aaaaaaaa-5e5e-4000-8000-000000000000', '2', 'sr-token-a2-0000000000000002'),
  ('aaaaaaaa-5f5f-4000-8000-000000000003', 'aaaaaaaa-5e5e-4000-8000-000000000000', '3', 'sr-token-a3-0000000000000003'),
  ('aaaaaaaa-5f5f-4000-8000-000000000004', 'aaaaaaaa-5e5e-4000-8000-000000000000', '4', 'sr-token-a4-0000000000000004'),
  ('bbbbbbbb-5f5f-4000-8000-000000000001', 'bbbbbbbb-5e5e-4000-8000-000000000000', '1', 'sr-token-b1-0000000000000001');

-- S1 live, S2 OPEN but started 3 hours ago (expired), S3 closed, S4 "ready to pay", S5 a takeout visit, SB the other restaurant's live visit.
insert into public.table_sessions (id, restaurant_id, table_id, status, started_at, ended_at) values
  ('aaaaaaaa-5d5d-4000-8000-000000000001', 'aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-5f5f-4000-8000-000000000001', 'OPEN', now(), null),
  ('aaaaaaaa-5d5d-4000-8000-000000000002', 'aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-5f5f-4000-8000-000000000002', 'OPEN', now() - interval '3 hours', null),
  ('aaaaaaaa-5d5d-4000-8000-000000000003', 'aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-5f5f-4000-8000-000000000003', 'CLOSED', now(), now()),
  ('aaaaaaaa-5d5d-4000-8000-000000000004', 'aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-5f5f-4000-8000-000000000004', 'PAYMENT_REQUESTED', now(), null),
  ('bbbbbbbb-5d5d-4000-8000-000000000001', 'bbbbbbbb-5e5e-4000-8000-000000000000', 'bbbbbbbb-5f5f-4000-8000-000000000001', 'OPEN', now(), null);
insert into public.table_sessions (id, restaurant_id, kind, customer_name, customer_phone) values
  ('aaaaaaaa-5d5d-4000-8000-000000000005', 'aaaaaaaa-5e5e-4000-8000-000000000000', 'PICKUP', 'Sara', '+962791234567');

-- ── The public function (as anon: a guest, no login) ──
set local role anon;
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'CALL_WAITER') ->> 'ok', 'true', 'a guest at a live table can call the waiter');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'CALL_WAITER') ->> 'error', 'ALREADY_REQUESTED', 'the same request cannot wait twice for one visit');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'CLEAN_TABLE') ->> 'ok', 'true', 'another kind is a separate request');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'ORDER_FOOD') ->> 'error', 'INVALID_KIND', 'an unknown kind is refused');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000001', null) ->> 'error', 'INVALID_KIND', 'a missing kind is refused');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000005', 'CALL_WAITER') ->> 'error', 'NOT_A_TABLE_VISIT', 'a takeout visit has no table to serve');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000003', 'CALL_WAITER') ->> 'error', 'SESSION_ENDED', 'a closed visit takes no requests');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000002', 'CALL_WAITER') ->> 'error', 'SESSION_ENDED', 'a visit past its 2 hours takes no requests, even though it still says OPEN');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000004', 'REQUEST_BILL') ->> 'error', 'ALREADY_REQUESTED', 'the bill cannot be asked for once the waiter has signalled ready to pay');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000004', 'CALL_WAITER') ->> 'ok', 'true', 'the guest can still call the waiter then');
select is(public.create_service_request('sr-b', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'REQUEST_BILL'), null, 'another restaurant''s slug cannot reach this visit');
select is(public.create_service_request('sr-a', 'aaaaaaaa-5d5d-4000-8000-0000000000ff', 'CALL_WAITER'), null, 'an unknown visit gives nothing');
select throws_ok($$ insert into public.service_requests (restaurant_id, session_id, table_id, kind) values ('aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'aaaaaaaa-5f5f-4000-8000-000000000001', 'REQUEST_BILL') $$,
  '42501', null, 'a guest cannot insert a row directly');
select throws_ok($$ select count(*) from public.service_requests $$, '42501', null, 'a guest cannot read the table');
select is(jsonb_array_length(public.get_public_service_requests('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000001')), 2, 'a guest reads the requests of their own visit');
select is(jsonb_array_length(public.get_public_service_requests('sr-b', 'aaaaaaaa-5d5d-4000-8000-000000000001')), 0, 'another restaurant''s slug sees nothing of this visit');
select is(jsonb_array_length(public.get_public_service_requests('sr-a', 'aaaaaaaa-5d5d-4000-8000-000000000004')), 1, 'each visit sees only its own requests');

-- ── Rules of the table itself (superuser) ──
reset role;
select throws_ok($$ insert into public.service_requests (restaurant_id, session_id, table_id, kind) values ('aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'aaaaaaaa-5f5f-4000-8000-000000000001', 'CALL_WAITER') $$,
  '23505', null, 'one waiting request per kind per visit, even for a direct insert');
select throws_ok($$ insert into public.service_requests (restaurant_id, session_id, table_id, kind, status) values ('aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'aaaaaaaa-5f5f-4000-8000-000000000001', 'REQUEST_BILL', 'DONE') $$,
  '23514', null, 'done needs its time (and waiting must not have one)');
select throws_ok($$ insert into public.service_requests (restaurant_id, session_id, table_id, kind) values ('bbbbbbbb-5e5e-4000-8000-000000000000', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'bbbbbbbb-5f5f-4000-8000-000000000001', 'REQUEST_BILL') $$,
  '23503', null, 'a request cannot point at another restaurant''s visit (composite FK)');
insert into public.service_requests (restaurant_id, session_id, table_id, kind) values
  ('bbbbbbbb-5e5e-4000-8000-000000000000', 'bbbbbbbb-5d5d-4000-8000-000000000001', 'bbbbbbbb-5f5f-4000-8000-000000000001', 'CALL_WAITER');

-- ── Staff: the waiter of restaurant A ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e3","role":"authenticated"}';
select is((select count(*)::int from public.service_requests), 3, 'the waiter sees the requests of their own restaurant (and none of the other one)');
select is((select count(*)::int from public.service_requests where restaurant_id = 'bbbbbbbb-5e5e-4000-8000-000000000000'), 0, 'the waiter sees nothing of restaurant B');
select lives_ok($$ update public.service_requests set status = 'DONE' where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000001' and kind = 'CLEAN_TABLE' $$, 'the waiter can mark a request done');
select ok((select resolved_at is not null from public.service_requests where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000001' and kind = 'CLEAN_TABLE'), 'the database stamps the time it was done');
select throws_ok($$ update public.service_requests set status = 'OPEN' where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000001' and kind = 'CLEAN_TABLE' $$,
  '23514', null, 'done is final');
select throws_ok($$ update public.service_requests set kind = 'REQUEST_BILL' where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000001' $$, '42501', null, 'the kind can never be changed');
select throws_ok($$ update public.service_requests set restaurant_id = 'bbbbbbbb-5e5e-4000-8000-000000000000' where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000001' $$, '42501', null, 'a request cannot be moved to another restaurant');
select throws_ok($$ insert into public.service_requests (restaurant_id, session_id, table_id, kind) values ('aaaaaaaa-5e5e-4000-8000-000000000000', 'aaaaaaaa-5d5d-4000-8000-000000000001', 'aaaaaaaa-5f5f-4000-8000-000000000001', 'REQUEST_BILL') $$, '42501', null, 'staff cannot insert requests either (only the public function)');
select throws_ok($$ delete from public.service_requests $$, '42501', null, 'nobody deletes requests');
select lives_ok($$ update public.service_requests set status = 'DONE' where restaurant_id = 'bbbbbbbb-5e5e-4000-8000-000000000000' $$, 'the waiter''s attempt on another restaurant''s request is silently ignored (row level security)');
reset role;
select is((select status::text from public.service_requests where restaurant_id = 'bbbbbbbb-5e5e-4000-8000-000000000000'), 'OPEN', 'and that request is still waiting');
set local role authenticated;

-- ── The cashier does not see service requests (spec section 4) ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e4","role":"authenticated"}';
select is((select count(*)::int from public.service_requests), 0, 'the cashier sees no service requests');
select lives_ok($$ update public.service_requests set status = 'DONE' where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000004' $$, 'the cashier''s attempt to resolve one is silently ignored (row level security)');
reset role;
select is((select status::text from public.service_requests where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000004' and kind = 'CALL_WAITER'), 'OPEN', 'and it is still waiting');
set local role authenticated;

-- ── Manager and owner see what is still waiting; the other restaurant's owner sees only their own ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e2","role":"authenticated"}';
select is((select count(*)::int from public.service_requests where status = 'OPEN'), 2, 'the manager sees what is still waiting');
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1","role":"authenticated"}';
select is((select count(*)::int from public.service_requests where status = 'OPEN'), 2, 'the owner sees what is still waiting');
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e6","role":"authenticated"}';
select is((select count(*)::int from public.service_requests), 1, 'the other restaurant''s owner sees only their own request');

-- ── Closing the visit resolves what it still asked for (the cashier closes it after payment) ──
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e4","role":"authenticated"}';
select lives_ok($$ update public.table_sessions set status = 'CLOSED' where id = 'aaaaaaaa-5d5d-4000-8000-000000000004' $$, 'the cashier closes the paid visit');
reset role;
select is((select status::text from public.service_requests where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000004' and kind = 'CALL_WAITER'), 'DONE', 'closing a visit resolves its waiting requests');
select ok((select resolved_at is not null from public.service_requests where session_id = 'aaaaaaaa-5d5d-4000-8000-000000000004' and kind = 'CALL_WAITER'), 'and stamps the time');

-- ── Who may call what ──
select ok(has_function_privilege('anon', 'public.create_service_request(text, uuid, text)', 'execute'), 'anon can call create_service_request (the public path)');
select ok(has_function_privilege('anon', 'public.get_public_service_requests(text, uuid)', 'execute'), 'anon can call get_public_service_requests');

select * from finish();
rollback;
