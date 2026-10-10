-- Table sessions close by themselves 2 hours after they start (decided by Nour, 2026-10-10: "a table session stays open
-- for 2 hours before it closes automatically"; spec section 4: "session ends by timer or manual").
-- Without this, guests who leave without paying would leave an OPEN session that tomorrow's guests join.
--
-- It is enforced LAZILY, in the database, wherever a session is used (no scheduled job needed):
--   * join_table_session   closes a stale live session of the table, then starts a fresh one
--   * get_public_session   reports a stale session as CLOSED even if nobody closed it yet
--   * orders insert        refuses a stale session (orders_require_open_session)
-- Staff can still end a visit earlier by hand. The clock starts when the visit starts (started_at).
-- Domain mirror: SESSION_MAX_AGE_HOURS / isSessionExpired in src/domain/table-session/table-session.ts.

create function public.session_ttl() returns interval
language sql immutable as $$ select interval '2 hours' $$;

-- ─── Orders: only into a live, unexpired OPEN session ───────────────────
create or replace function public.orders_require_open_session() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status  public.session_status;
  v_started timestamptz;
begin
  select s.status, s.started_at into v_status, v_started
  from public.table_sessions s where s.restaurant_id = new.restaurant_id and s.id = new.session_id;
  if v_status is distinct from 'OPEN' or v_started < now() - public.session_ttl() then
    raise exception 'orders can only be placed in an OPEN, unexpired table session' using errcode = '23514';
  end if;
  return new;
end $$;

-- ─── Scanning: a stale live session is closed, a fresh one starts ───────
create or replace function public.join_table_session(p_slug text, p_token text) returns jsonb
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

  -- The previous visit ran out of time: close it (the status-flow trigger stamps ended_at).
  update public.table_sessions set status = 'CLOSED'
  where table_id = v_table.id and status <> 'CLOSED' and started_at < now() - public.session_ttl();

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

-- ─── Looking a session up: expired = CLOSED ─────────────────────────────
create or replace function public.get_public_session(p_slug text, p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'session_id', s.id,
    'table_label', t.label,
    'status', case when s.status <> 'CLOSED' and s.started_at < now() - public.session_ttl() then 'CLOSED' else s.status end
  )
  from public.table_sessions s
  join public.restaurant_tables t on t.restaurant_id = s.restaurant_id and t.id = s.table_id
  join public.restaurants r on r.id = s.restaurant_id
  where r.slug = lower(trim(p_slug)) and s.id = p_session_id;
$$;
