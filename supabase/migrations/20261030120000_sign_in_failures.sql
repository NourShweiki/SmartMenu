-- Failed sign-ins, so the app can limit them (security review 2026-10-30, finding #1; rule in
-- src/domain/shared/sign-in-limit.ts). Supabase Auth's own limit counts per network address, but every sign-in reaches
-- it from OUR server, so it cannot tell visitors apart: the app counts them itself, here, where every server instance
-- sees the same numbers.
--
-- Not tenant data: a key is an account (the email typed) or a visitor (their network address), never a restaurant, so
-- there is no restaurant_id. Keys arrive already HASHED (SHA-256, hex) from the server: no email or address is stored.
-- Only the server (service_role) reads or writes this table; staff and guests have no access at all.

create table public.sign_in_failures (
  id         uuid primary key default gen_random_uuid(),
  key_hash   text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  failed_at  timestamptz not null default now()
);
-- "How many failures has this key had lately": the only question asked on every sign-in.
create index sign_in_failures_key_idx on public.sign_in_failures (key_hash, failed_at);
-- Old rows are swept by age.
create index sign_in_failures_age_idx on public.sign_in_failures (failed_at);

alter table public.sign_in_failures enable row level security;
-- No policies on purpose: nobody but the service role (which bypasses RLS) touches it.
revoke all on public.sign_in_failures from anon, authenticated;
grant all on public.sign_in_failures to service_role;

-- How many failures each key has had AFTER p_since (a failure stops counting exactly at the end of the window).
create function public.count_sign_in_failures(p_keys text[], p_since timestamptz)
returns table (key_hash text, failures integer)
language sql stable set search_path = '' as $$
  select f.key_hash, count(*)::integer
  from public.sign_in_failures f
  where f.key_hash = any (p_keys) and f.failed_at > p_since
  group by f.key_hash
$$;

-- One failed attempt, counted under every key. Rows older than a day can never count again (the window is minutes):
-- they are swept here, so the table stays small without a scheduled job.
create function public.record_sign_in_failure(p_keys text[], p_at timestamptz)
returns void
language sql set search_path = '' as $$
  delete from public.sign_in_failures where failed_at < now() - interval '1 day';
  insert into public.sign_in_failures (key_hash, failed_at) select k, p_at from unnest(p_keys) as k;
$$;

-- Forget a key's failures (an account's, after it signed in successfully).
create function public.clear_sign_in_failures(p_key text)
returns void
language sql set search_path = '' as $$
  delete from public.sign_in_failures where key_hash = p_key;
$$;

revoke all on function public.count_sign_in_failures(text[], timestamptz) from public, anon, authenticated;
revoke all on function public.record_sign_in_failure(text[], timestamptz) from public, anon, authenticated;
revoke all on function public.clear_sign_in_failures(text) from public, anon, authenticated;
grant execute on function public.count_sign_in_failures(text[], timestamptz) to service_role;
grant execute on function public.record_sign_in_failure(text[], timestamptz) to service_role;
grant execute on function public.clear_sign_in_failures(text) to service_role;
