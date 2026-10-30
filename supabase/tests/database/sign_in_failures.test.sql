-- The failed sign-in log (migration 20261030120000_sign_in_failures.sql): only the server may use it, and its
-- functions count, record and clear the way src/application/use-cases/limit-sign-in.ts expects.
-- Run with: npx supabase test db supabase/tests/database/sign_in_failures.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ── Nobody but the server ──
select table_privs_are('public', 'sign_in_failures', 'anon', array[]::text[], 'anon has no access to sign_in_failures');
select table_privs_are('public', 'sign_in_failures', 'authenticated', array[]::text[], 'staff have no access to sign_in_failures');
select ok(not has_function_privilege('anon', 'public.count_sign_in_failures(text[], timestamptz)', 'execute'), 'anon cannot count failures');
select ok(not has_function_privilege('authenticated', 'public.record_sign_in_failure(text[], timestamptz)', 'execute'), 'staff cannot record failures');
select ok(not has_function_privilege('anon', 'public.clear_sign_in_failures(text)', 'execute'), 'anon cannot clear failures');
select ok(has_function_privilege('service_role', 'public.count_sign_in_failures(text[], timestamptz)', 'execute'), 'the server can count failures');
select ok(has_function_privilege('service_role', 'public.record_sign_in_failure(text[], timestamptz)', 'execute'), 'the server can record failures');
select ok(has_function_privilege('service_role', 'public.clear_sign_in_failures(text)', 'execute'), 'the server can clear failures');

-- ── Only hashes are stored ──
select throws_ok(
  $$ insert into public.sign_in_failures (key_hash) values ('owner@demo-dinein.test') $$,
  '23514', null, 'a plain email (not a SHA-256 hash) is refused'
);

-- ── Counting, recording, clearing (as the server) ──
set local role service_role;
select public.record_sign_in_failure(array[repeat('a', 64), repeat('b', 64)], now() - interval '20 minutes');
select public.record_sign_in_failure(array[repeat('a', 64), repeat('b', 64)], now() - interval '5 minutes');
select public.record_sign_in_failure(array[repeat('a', 64)], now() - interval '1 minute');

select results_eq(
  $$ select key_hash, failures from public.count_sign_in_failures(array[repeat('a', 64), repeat('b', 64), repeat('c', 64)], now() - interval '15 minutes') order by key_hash $$,
  $$ values (repeat('a', 64), 2), (repeat('b', 64), 1) $$,
  'counts only the failures inside the window, per key, and leaves out keys with none'
);
select is(
  (select failures from public.count_sign_in_failures(array[repeat('a', 64)], now() - interval '1 minute')),
  null::integer,
  'a failure exactly at the start of the window no longer counts'
);

select public.clear_sign_in_failures(repeat('a', 64));
select is((select count(*)::integer from public.sign_in_failures where key_hash = repeat('a', 64)), 0, 'clearing forgets every failure of that key');
select is((select count(*)::integer from public.sign_in_failures where key_hash = repeat('b', 64)), 2, '... and only of that key');

-- Rows older than a day are swept on the next recorded failure.
select public.record_sign_in_failure(array[repeat('d', 64)], now() - interval '2 days');
select public.record_sign_in_failure(array[repeat('e', 64)], now());
select is((select count(*)::integer from public.sign_in_failures where key_hash = repeat('d', 64)), 0, 'failures older than a day are swept');
select is((select count(*)::integer from public.sign_in_failures where key_hash = repeat('e', 64)), 1, 'the new failure is kept');

select * from finish();
rollback;
