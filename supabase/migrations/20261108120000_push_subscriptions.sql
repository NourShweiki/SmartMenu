-- Web push W2 (docs/WEB_PUSH_PLAN.md): where to send "your order is ready" to a guest's phone when the menu page is
-- closed. A subscription (the browser's push address + its two encryption keys) belongs to one VISIT (table or
-- pickup) and goes when the visit closes. Mirrors src/domain/table-session/push-subscription.ts.
--
-- Nobody reads or writes the table directly (RLS on, no policies, no grants to anon / authenticated):
--   save_push_subscription      a guest, for their own live visit (anon-callable, like create_service_request)
--   push_subscriptions_for_order staff who may move that order, once it is READY (to send the notice)
--   remove_push_subscription    staff of that restaurant, when the push service says the address is gone

-- The server will POST to the endpoint, so the database checks it as strictly as the domain does (SSRF guard): https,
-- default port, no user name, the NORMALIZED form the domain produces (lower-case host, a path that starts with "/"),
-- on a known push service, no space / control character / backslash anywhere, at most 1024 characters.
create function public.is_push_endpoint(p_endpoint text) returns boolean
language sql immutable set search_path = '' as $$
  select p_endpoint is not null
     and char_length(p_endpoint) <= 1024
     and p_endpoint !~ '[[:space:][:cntrl:]\\]'
     and p_endpoint ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)/'
$$;

create table public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  session_id     uuid not null,
  endpoint       text not null check (public.is_push_endpoint(endpoint)),
  -- base64url without padding: a 65-byte P-256 point (starts with 0x04 = "B") and a 16-byte secret; unused bits zero.
  p256dh         text not null check (p256dh ~ '^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$'),
  auth           text not null check (auth ~ '^[A-Za-z0-9_-]{21}[AQgw]$'),
  -- The language of the page the guest subscribed from: the notice is written in it.
  locale         text not null check (locale in ('ar', 'en')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  unique (session_id, endpoint),
  -- The visit must belong to the SAME restaurant (composite FK), and the rows go with it.
  foreign key (restaurant_id, session_id) references public.table_sessions (restaurant_id, id) on delete cascade
);
create index push_subscriptions_session_idx on public.push_subscriptions (restaurant_id, session_id);

-- A closed visit is told nothing more: its subscriptions are deleted when it closes (the cashier after payment, staff
-- by hand, or a pickup visit closing itself after its last order). SECURITY DEFINER: whoever closes the visit has no
-- right on this table. (A table visit that merely EXPIRES is not updated; the functions below leave it out.)
create function public.table_sessions_drop_push_subscriptions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'CLOSED' and old.status is distinct from 'CLOSED' then
    delete from public.push_subscriptions p where p.restaurant_id = new.restaurant_id and p.session_id = new.id;
  end if;
  return null;
end $$;

create trigger table_sessions_drop_push_subscriptions after update of status on public.table_sessions
  for each row execute function public.table_sessions_drop_push_subscriptions();

-- ─── Row Level Security + privileges: no direct access at all ─────────────
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

-- ─── Public: a guest saves a subscription for their own visit ────────────
-- Returns { ok: true } when saved (saving the same address again refreshes its keys and language), { ok: false, error }
-- when refused, or NULL when the visit does not belong to this restaurant (or does not exist). Errors:
-- SESSION_ENDED (closed, or a table visit past its 2 hours), INVALID_SUBSCRIPTION (address, keys or language),
-- TOO_MANY (already 5 phones for this visit). The visit id is the guest's key (from the server-set cookie); the
-- restaurant always comes from the visit.
create function public.save_push_subscription(
  p_slug text, p_session_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_locale text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.table_sessions;
begin
  -- Locks the visit row: two phones saving at the same moment cannot both pass the cap.
  select s.* into v_session
  from public.table_sessions s join public.restaurants r on r.id = s.restaurant_id
  where r.slug = lower(trim(p_slug)) and s.id = p_session_id
  for update of s;
  if not found then
    return null;
  end if;

  if v_session.status = 'CLOSED' or (v_session.kind = 'TABLE' and v_session.started_at < now() - public.session_ttl()) then
    return jsonb_build_object('ok', false, 'error', 'SESSION_ENDED');
  end if;

  if not public.is_push_endpoint(p_endpoint)
     or coalesce(p_p256dh, '') !~ '^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{21}[AQgw]$'
     or coalesce(p_locale, '') not in ('ar', 'en') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SUBSCRIPTION');
  end if;

  if (select count(*) from public.push_subscriptions p
      where p.restaurant_id = v_session.restaurant_id and p.session_id = v_session.id and p.endpoint <> p_endpoint) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY');
  end if;

  insert into public.push_subscriptions (restaurant_id, session_id, endpoint, p256dh, auth, locale)
  values (v_session.restaurant_id, v_session.id, p_endpoint, p_p256dh, p_auth, p_locale)
  on conflict (session_id, endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, locale = excluded.locale, updated_at = now();

  return jsonb_build_object('ok', true);
end $$;

-- ─── Staff: where to send the notice for an order that is READY ─────────
-- Only someone who may move that order gets anything (role.ts `permissionsToMoveTo`): owner, manager and waiter; the
-- cashier too for a PICKUP order. Only while the order is READY and its visit is live. Otherwise (or for another
-- restaurant's order): an empty list, never an error that tells whether the order exists.
create function public.push_subscriptions_for_order(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth, 'locale', p.locale)
                            order by p.created_at), '[]'::jsonb)
  from public.orders o
  join public.table_sessions s on s.restaurant_id = o.restaurant_id and s.id = o.session_id
  join public.push_subscriptions p on p.restaurant_id = s.restaurant_id and p.session_id = s.id
  where o.id = p_order_id
    and o.status = 'READY'
    and s.status <> 'CLOSED'
    and not (s.kind = 'TABLE' and s.started_at < now() - public.session_ttl())
    and (public.has_restaurant_role(o.restaurant_id, array['OWNER','MANAGER','WAITER']::public.app_role[])
         or (s.kind = 'PICKUP' and public.has_restaurant_role(o.restaurant_id, array['CASHIER']::public.app_role[])));
$$;

-- ─── Staff: forget an address the push service says no longer exists ────
-- Any member of the subscription's restaurant (whoever sent the notice). True when it was removed.
create function public.remove_push_subscription(p_subscription_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_removed int;
begin
  delete from public.push_subscriptions p
  where p.id = p_subscription_id
    and public.has_restaurant_role(p.restaurant_id, array['OWNER','MANAGER','WAITER','CASHIER']::public.app_role[]);
  get diagnostics v_removed = row_count;
  return v_removed > 0;
end $$;

revoke all on function public.is_push_endpoint(text) from public;
revoke all on function public.save_push_subscription(text, uuid, text, text, text, text) from public;
revoke all on function public.push_subscriptions_for_order(uuid) from public;
revoke all on function public.remove_push_subscription(uuid) from public;
grant execute on function public.is_push_endpoint(text) to anon, authenticated, service_role;
grant execute on function public.save_push_subscription(text, uuid, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.push_subscriptions_for_order(uuid) to authenticated, service_role;
grant execute on function public.remove_push_subscription(uuid) to authenticated, service_role;
