-- Guest service requests: call the waiter, have the table cleaned, ask for the bill
-- (mirrors src/domain/service-request/service-request.ts; spec section 4: a guest "can request waiter / cleaning /
-- payment"; the waiter handles them; the CASHIER does not see them).
--
-- A request belongs to a table VISIT (a TABLE session), never to a takeout (PICKUP) visit: there is no table to serve.
-- Customers have no accounts, so a guest cannot insert a row. They call create_service_request(slug, session_id, kind),
-- a narrow public function (SECURITY DEFINER, anon-callable) that applies the same rules as the domain, and read their
-- own visit's requests through get_public_service_requests. Staff (owner, manager, waiter) read and resolve them.

create type public.service_kind as enum ('CALL_WAITER', 'CLEAN_TABLE', 'REQUEST_BILL');
create type public.service_request_status as enum ('OPEN', 'DONE');

create table public.service_requests (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  session_id     uuid not null,
  table_id       uuid not null,
  kind           public.service_kind not null,
  status         public.service_request_status not null default 'OPEN',
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  check ((status = 'DONE') = (resolved_at is not null)),
  unique (restaurant_id, id),
  -- Both ends must belong to the SAME restaurant (composite FKs): a request cannot point at another tenant's visit or table.
  foreign key (restaurant_id, session_id) references public.table_sessions (restaurant_id, id),
  foreign key (restaurant_id, table_id) references public.restaurant_tables (restaurant_id, id)
);
-- One WAITING request per kind per visit (the domain rule). Also what makes two phones pressing at the same moment safe.
create unique index service_requests_one_open_per_kind on public.service_requests (session_id, kind) where status = 'OPEN';
-- The waiter's list: what is waiting in this restaurant, the longest-waiting first.
create index service_requests_waiting_idx on public.service_requests (restaurant_id, created_at) where status = 'OPEN';

-- ─── Lifecycle: OPEN -> DONE, final; the time is stamped by the database ─────
create function public.service_requests_enforce_flow() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'DONE' then
    raise exception 'a done service request cannot change' using errcode = '23514';
  end if;
  if new.status = 'DONE' then
    new.resolved_at := now();
  end if;
  return new;
end $$;

create trigger service_requests_status_flow before update of status on public.service_requests
  for each row execute function public.service_requests_enforce_flow();

-- When a visit is closed (the cashier after payment, or staff by hand) nothing it asked for is still waiting.
-- SECURITY DEFINER: whoever closes the visit (the cashier) is not allowed to touch service requests.
-- (A visit that merely EXPIRES is closed lazily, never updated: the waiter's list leaves those out by itself.)
create function public.table_sessions_resolve_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'CLOSED' and old.status is distinct from 'CLOSED' then
    update public.service_requests q set status = 'DONE'
    where q.restaurant_id = new.restaurant_id and q.session_id = new.id and q.status = 'OPEN';
  end if;
  return null;
end $$;

create trigger table_sessions_resolve_requests after update of status on public.table_sessions
  for each row execute function public.table_sessions_resolve_requests();

-- ─── Row Level Security: owner, manager and waiter only (role.ts `service-requests:handle`) ──
alter table public.service_requests enable row level security;

create policy "service staff read requests" on public.service_requests
  for select to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER']::public.app_role[]));
create policy "service staff resolve requests" on public.service_requests
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER']::public.app_role[]));

-- ─── Privileges (pinned: never rely on the platform's defaults, see pin_table_privileges) ─
revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
grant update (status) on public.service_requests to authenticated; -- resolved_at is set by the trigger; nothing else ever changes
grant all on public.service_requests to service_role;

-- ─── Public: a guest asks for something ─────────────────────────────────
-- Returns { ok: true, id, kind } when the request was made, { ok: false, error } when it was refused, or NULL when the
-- session does not belong to this restaurant (or does not exist). Errors, as in the domain: INVALID_KIND,
-- NOT_A_TABLE_VISIT (a takeout visit), SESSION_ENDED (closed, or past its 2 hours), ALREADY_REQUESTED (the same
-- request is already waiting, or the waiter has already signalled "ready to pay" and the guest asks for the bill).
-- The session id is the guest's key to their visit (like for ordering): the restaurant always comes from the session.
create function public.create_service_request(p_slug text, p_session_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.table_sessions;
  v_kind    public.service_kind;
  v_id      uuid;
begin
  select s.* into v_session
  from public.table_sessions s join public.restaurants r on r.id = s.restaurant_id
  where r.slug = lower(trim(p_slug)) and s.id = p_session_id;
  if not found then
    return null;
  end if;

  if p_kind is null or p_kind not in ('CALL_WAITER', 'CLEAN_TABLE', 'REQUEST_BILL') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_KIND');
  end if;
  v_kind := p_kind::public.service_kind;

  if v_session.kind <> 'TABLE' or v_session.table_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_TABLE_VISIT');
  end if;
  if v_session.status = 'CLOSED' or v_session.started_at < now() - public.session_ttl() then
    return jsonb_build_object('ok', false, 'error', 'SESSION_ENDED');
  end if;
  if v_kind = 'REQUEST_BILL' and v_session.status = 'PAYMENT_REQUESTED' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REQUESTED');
  end if;

  insert into public.service_requests (restaurant_id, session_id, table_id, kind)
  values (v_session.restaurant_id, v_session.id, v_session.table_id, v_kind)
  on conflict (session_id, kind) where status = 'OPEN' do nothing
  returning id into v_id;
  if v_id is null then -- the same request is already waiting (maybe another phone at the table pressed it a moment ago)
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REQUESTED');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'kind', v_kind);
end $$;

-- What a guest's phone may know about its own visit's requests: kind, status and when, the newest first (at most 20).
-- Never anything about other visits or other restaurants: the session must belong to the restaurant of the slug.
create function public.get_public_service_requests(p_slug text, p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'status', q.status, 'created_at', q.created_at)
                            order by q.created_at desc), '[]'::jsonb)
  from (
    select r2.id, r2.kind, r2.status, r2.created_at
    from public.service_requests r2
    join public.table_sessions s on s.restaurant_id = r2.restaurant_id and s.id = r2.session_id
    join public.restaurants r on r.id = s.restaurant_id
    where r.slug = lower(trim(p_slug)) and r2.session_id = p_session_id
    order by r2.created_at desc
    limit 20
  ) q;
$$;

revoke all on function public.create_service_request(text, uuid, text) from public;
revoke all on function public.get_public_service_requests(text, uuid) from public;
grant execute on function public.create_service_request(text, uuid, text) to anon, authenticated, service_role;
grant execute on function public.get_public_service_requests(text, uuid) to anon, authenticated, service_role;
