-- Phase 4 step 4b: tables with QR codes, and table sessions (mirrors src/domain/table-session/table-session.ts).
--   restaurant_tables  a physical table; its QR code carries `token` (random, 128+ bits), NOT the label
--   table_sessions     one visit at one table; several customer devices share it; OPEN -> PAYMENT_REQUESTED -> CLOSED
-- Customers have no accounts: a scan calls join_table_session(slug, token), a narrow public function (SECURITY DEFINER,
-- anon-callable) that returns the table's live session (creating it if none) and nothing else.

-- ─── Tables ─────────────────────────────────────────────────────────────
create table public.restaurant_tables (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  -- A short number or name ("7", "Terrace 2"): tidy (no outer or doubled spaces), no control characters or markup.
  label          text not null check (
                   char_length(label) between 1 and 20
                   and label = regexp_replace(btrim(label), '\s+', ' ', 'g')
                   and label !~ '[[:cntrl:]<>]'),
  -- The random part of the printed QR link. 22+ URL-safe characters = at least 128 bits.
  token          text not null unique check (token ~ '^[A-Za-z0-9_-]{22,64}$'),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  deleted_at     timestamptz,
  unique (restaurant_id, id)
);
-- Labels are unique per restaurant ignoring case; a soft-deleted table frees its label.
create unique index restaurant_tables_label_key on public.restaurant_tables (restaurant_id, lower(label)) where deleted_at is null;
create index restaurant_tables_restaurant_idx on public.restaurant_tables (restaurant_id, created_at) where deleted_at is null;

create trigger restaurant_tables_updated_at before update on public.restaurant_tables
  for each row execute function public.set_updated_at();

-- ─── Sessions ───────────────────────────────────────────────────────────
create type public.session_status as enum ('OPEN', 'PAYMENT_REQUESTED', 'CLOSED');

create table public.table_sessions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  table_id       uuid not null,
  status         public.session_status not null default 'OPEN',
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  check ((status = 'CLOSED') = (ended_at is not null)),
  unique (restaurant_id, id),
  foreign key (restaurant_id, table_id) references public.restaurant_tables (restaurant_id, id)
);
-- A table has at most ONE live (not closed) session: everyone who scans its QR joins the same visit.
create unique index table_sessions_one_live_per_table on public.table_sessions (table_id) where status <> 'CLOSED';
create index table_sessions_restaurant_idx on public.table_sessions (restaurant_id, status, started_at desc);

-- The lifecycle is enforced by the database for every role (domain: moveSessionTo): OPEN -> PAYMENT_REQUESTED -> CLOSED,
-- or OPEN -> CLOSED by hand. No going back, nothing after CLOSED.
create function public.table_sessions_enforce_flow() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'OPEN' and new.status in ('PAYMENT_REQUESTED', 'CLOSED'))
            or (old.status = 'PAYMENT_REQUESTED' and new.status = 'CLOSED')) then
      raise exception 'session status cannot go from % to %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'CLOSED' then
      new.ended_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger table_sessions_status_flow before update of status on public.table_sessions
  for each row execute function public.table_sessions_enforce_flow();

-- ─── Orders now belong to a real session, and only an OPEN one takes new orders ─────────
alter table public.orders
  add constraint orders_session_fk foreign key (restaurant_id, session_id) references public.table_sessions (restaurant_id, id);

create function public.orders_require_open_session() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status public.session_status;
begin
  select s.status into v_status from public.table_sessions s where s.restaurant_id = new.restaurant_id and s.id = new.session_id;
  if v_status is distinct from 'OPEN' then
    raise exception 'orders can only be placed in an OPEN table session' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger orders_open_session before insert on public.orders
  for each row execute function public.orders_require_open_session();

-- ─── Row Level Security ─────────────────────────────────────────────────
alter table public.restaurant_tables enable row level security;
alter table public.table_sessions    enable row level security;

create policy "members read tables" on public.restaurant_tables
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
-- Managing tables is role.ts `tables:manage` (OWNER, MANAGER).
create policy "table managers add tables" on public.restaurant_tables
  for insert to authenticated
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));
create policy "table managers change tables" on public.restaurant_tables
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]))
  with check (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[]));

create policy "members read sessions" on public.table_sessions
  for select to authenticated using (public.has_restaurant_role(restaurant_id));
-- Same split as the order flow: the floor signals "ready to pay", the cashier closes after payment, owner/manager both.
create policy "staff move sessions by role" on public.table_sessions
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER','CASHIER']::public.app_role[]))
  with check (
    public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[])
    or (public.has_restaurant_role(restaurant_id, array['WAITER']::public.app_role[]) and status = 'PAYMENT_REQUESTED')
    or (public.has_restaurant_role(restaurant_id, array['CASHIER']::public.app_role[]) and status = 'CLOSED')
  );

-- ─── Privileges (pinned: never rely on the platform's defaults, see pin_table_privileges) ─
revoke all on public.restaurant_tables, public.table_sessions from anon, authenticated;
grant select, insert on public.restaurant_tables to authenticated;
-- Never the id or restaurant_id: a table cannot be moved to another restaurant.
grant update (label, token, is_active, deleted_at) on public.restaurant_tables to authenticated;
grant select on public.table_sessions to authenticated;
grant update (status) on public.table_sessions to authenticated; -- ended_at is set by the trigger
grant all on public.restaurant_tables, public.table_sessions to service_role;

-- ─── Public: scan a QR code ─────────────────────────────────────────────
-- Returns { session_id, table_label, status } for the table's live session (creating it if there is none), or NULL
-- when the code is not valid: unknown restaurant or token, an inactive or deleted table, or a restaurant that has
-- dine-in switched off. The token is 128+ random bits, so it cannot be guessed. Exposes the label and the session id
-- (the customer's key for ordering at this table) and nothing else.
create function public.join_table_session(p_slug text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant_id uuid;
  v_dine_in       boolean;
  v_table         public.restaurant_tables;
  v_session       public.table_sessions;
begin
  select r.id, s.dine_in_enabled into v_restaurant_id, v_dine_in
  from public.restaurants r join public.restaurant_settings s on s.restaurant_id = r.id
  where r.slug = lower(trim(p_slug));
  if v_restaurant_id is null or not v_dine_in then
    return null;
  end if;

  select * into v_table from public.restaurant_tables t
  where t.restaurant_id = v_restaurant_id and t.token = p_token and t.is_active and t.deleted_at is null;
  if not found then
    return null;
  end if;

  select * into v_session from public.table_sessions where table_id = v_table.id and status <> 'CLOSED';
  if not found then
    insert into public.table_sessions (restaurant_id, table_id) values (v_restaurant_id, v_table.id)
    on conflict do nothing returning * into v_session;
    if not found then -- another phone scanned at the same moment and created it first: join that one
      select * into v_session from public.table_sessions where table_id = v_table.id and status <> 'CLOSED';
    end if;
  end if;

  return jsonb_build_object('session_id', v_session.id, 'table_label', v_table.label, 'status', v_session.status);
end $$;

-- A device that already has a session id asks whether it is still the live one (e.g. before ordering).
-- NULL when the session does not belong to this restaurant.
create function public.get_public_session(p_slug text, p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('session_id', s.id, 'table_label', t.label, 'status', s.status)
  from public.table_sessions s
  join public.restaurant_tables t on t.restaurant_id = s.restaurant_id and t.id = s.table_id
  join public.restaurants r on r.id = s.restaurant_id
  where r.slug = lower(trim(p_slug)) and s.id = p_session_id;
$$;

revoke all on function public.join_table_session(text, text) from public;
revoke all on function public.get_public_session(text, uuid) from public;
grant execute on function public.join_table_session(text, text) to anon, authenticated, service_role;
grant execute on function public.get_public_session(text, uuid) to anon, authenticated, service_role;
