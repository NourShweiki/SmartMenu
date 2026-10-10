-- A table session closes by itself 2 hours after it starts (decided by Nour, 2026-10-10). Enforced lazily where sessions
-- are used: scanning closes a stale session and starts a fresh one, looking one up reports it CLOSED, and orders are
-- refused in it. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.restaurants (id, slug, name_en, name_ar) values
  ('aaaaaaaa-9e9e-4000-8000-000000000000', 'se-a', 'SE A', 'أ');
insert into public.restaurant_settings (restaurant_id, dine_in_enabled) values ('aaaaaaaa-9e9e-4000-8000-000000000000', true);

insert into public.restaurant_tables (id, restaurant_id, label, token) values
  ('aaaaaaaa-9f9f-4000-8000-000000000001', 'aaaaaaaa-9e9e-4000-8000-000000000000', 'Stale', 'se-token-1-0000000000000001'),
  ('aaaaaaaa-9f9f-4000-8000-000000000002', 'aaaaaaaa-9e9e-4000-8000-000000000000', 'Fresh', 'se-token-2-0000000000000002'),
  ('aaaaaaaa-9f9f-4000-8000-000000000003', 'aaaaaaaa-9e9e-4000-8000-000000000000', 'Quiet', 'se-token-3-0000000000000003'),
  ('aaaaaaaa-9f9f-4000-8000-000000000004', 'aaaaaaaa-9e9e-4000-8000-000000000000', 'Pay',   'se-token-4-0000000000000004');
insert into public.table_sessions (id, restaurant_id, table_id, status, started_at) values
  ('aaaaaaaa-9a9a-4000-8000-000000000001', 'aaaaaaaa-9e9e-4000-8000-000000000000', 'aaaaaaaa-9f9f-4000-8000-000000000001', 'OPEN',              now() - interval '3 hours'),
  ('aaaaaaaa-9a9a-4000-8000-000000000002', 'aaaaaaaa-9e9e-4000-8000-000000000000', 'aaaaaaaa-9f9f-4000-8000-000000000002', 'OPEN',              now() - interval '1 hour'),
  ('aaaaaaaa-9a9a-4000-8000-000000000003', 'aaaaaaaa-9e9e-4000-8000-000000000000', 'aaaaaaaa-9f9f-4000-8000-000000000003', 'OPEN',              now() - interval '3 hours'),
  ('aaaaaaaa-9a9a-4000-8000-000000000004', 'aaaaaaaa-9e9e-4000-8000-000000000000', 'aaaaaaaa-9f9f-4000-8000-000000000004', 'PAYMENT_REQUESTED', now() - interval '3 hours');

select is(public.session_ttl(), interval '2 hours', 'a session lives 2 hours');

-- ── A guest scans (anonymous) ──
set local role anon;
select is(public.join_table_session('se-a', 'se-token-2-0000000000000002') ->> 'session_id', 'aaaaaaaa-9a9a-4000-8000-000000000002',
  'a visit that is 1 hour old is still the live one: scanning joins it');
select isnt(public.join_table_session('se-a', 'se-token-1-0000000000000001') ->> 'session_id', 'aaaaaaaa-9a9a-4000-8000-000000000001',
  'a visit that is 3 hours old has run out: scanning starts a NEW one');
select is(public.join_table_session('se-a', 'se-token-1-0000000000000001') ->> 'status', 'OPEN', 'the new visit is OPEN');
select is(public.join_table_session('se-a', 'se-token-1-0000000000000001') ->> 'session_id',
          public.join_table_session('se-a', 'se-token-1-0000000000000001') ->> 'session_id',
  'scanning again right away joins that same new visit (no thrash)');
select isnt(public.join_table_session('se-a', 'se-token-4-0000000000000004') ->> 'session_id', 'aaaaaaaa-9a9a-4000-8000-000000000004',
  'a stale visit that had asked for payment is ended too: the next guests get a new one');

-- Looking a session up reports an expired one as CLOSED, even though nobody has closed it in the table yet.
select is(public.get_public_session('se-a', 'aaaaaaaa-9a9a-4000-8000-000000000003') ->> 'status', 'CLOSED',
  'a session older than 2 hours is reported CLOSED');
select is(public.get_public_session('se-a', 'aaaaaaaa-9a9a-4000-8000-000000000002') ->> 'status', 'OPEN',
  'a session younger than 2 hours is reported as it is');

-- ── What really happened in the table (superuser) ──
reset role;
select ok((select status = 'CLOSED' and ended_at is not null from public.table_sessions where id = 'aaaaaaaa-9a9a-4000-8000-000000000001'),
  'scanning really closed the stale visit (end time stamped)');
select is((select status::text from public.table_sessions where id = 'aaaaaaaa-9a9a-4000-8000-000000000003'), 'OPEN',
  'a plain lookup changes nothing (the quiet table was never scanned)');

-- ── Orders: refused in a stale session, fine in a fresh one ──
select throws_ok(
  $$ insert into public.orders (restaurant_id, session_id, number, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
     values ('aaaaaaaa-9e9e-4000-8000-000000000000', 'aaaaaaaa-9a9a-4000-8000-000000000003', 1, 0, 0, 0, 0, 0, 0) $$,
  '23514', null, 'an order cannot be placed in a session that has run out, even if nobody closed it yet');
select lives_ok(
  $$ insert into public.orders (restaurant_id, session_id, number, subtotal_fils, service_charge_fils, tax_fils, total_fils, tax_rate_bp, service_charge_bp)
     values ('aaaaaaaa-9e9e-4000-8000-000000000000', 'aaaaaaaa-9a9a-4000-8000-000000000002', 1, 0, 0, 0, 0, 0, 0) $$,
  'an order can be placed in a session that is still within its 2 hours');

select * from finish();
rollback;
