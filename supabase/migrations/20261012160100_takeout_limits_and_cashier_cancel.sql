-- Takeout, hardened (Nour, 2026-10-12: "how can we fix order abuse, fix it"; "use what's best for uncollected orders").
--
-- 1. LIMITS on starting a pickup visit. A takeout order needs no account and no proof of the phone number, so
--    without limits anybody could flood a kitchen with fake orders. Three limits, each checked by place_order at
--    the moment a NEW pickup visit would start (adding to an open visit is not limited: it is the same customer):
--      PK001  the same phone number already has 2 pickup visits in progress at this restaurant
--      PK002  the same device (a hash of its network address, when the server knows it) started 3 pickup visits
--             here in the last 10 minutes
--      PK003  the restaurant already has 20 takeout orders waiting to be confirmed (status NEW): takeout pauses
--             until staff confirm or cancel some. This is the one that bounds a determined attacker, who can make
--             up phone numbers and change addresses: the queue can never hold more than 20 unconfirmed takeout orders.
--    The numbers live in one place (pickup_limits) and are deliberately generous for real customers.
--
-- 2. The CASHIER may cancel a takeout order (not a table order): a takeout counter is often the cashier alone, and
--    an order nobody collects would otherwise sit in the queue until the owner comes by. The order is kept, with the
--    reason (the new NOT_COLLECTED, or any other), like every cancellation.

-- ─── The device a pickup visit was started from ─────────────────────────
alter table public.table_sessions
  add column client_hash text check (client_hash is null or client_hash ~ '^[0-9a-f]{64}$');
comment on column public.table_sessions.client_hash is
  'Pickup visits: SHA-256 of the network address the order came from, salted with the restaurant id (never the address itself). Null when unknown. Only used to limit how many visits one device starts.';
create index table_sessions_client_hash_idx on public.table_sessions (restaurant_id, client_hash, started_at desc) where client_hash is not null;
create index table_sessions_pickup_phone_idx on public.table_sessions (restaurant_id, customer_phone) where kind = 'PICKUP' and status <> 'CLOSED';
-- For the count of takeout orders that wait to be confirmed.
create index orders_new_idx on public.orders (restaurant_id, session_id) where status = 'NEW';

create function public.pickup_limits() returns table (open_per_phone integer, per_device integer, device_window interval, waiting_per_restaurant integer)
language sql immutable as $$ select 2, 3, interval '10 minutes', 20 $$;

-- Raises PK001 / PK002 / PK003 when a new pickup visit may not start. Called by place_order only.
create function public.check_pickup_limits(p_restaurant_id uuid, p_phone text, p_client_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_count integer;
begin
  select * into v from public.pickup_limits();

  -- Visits past their 2 hours count as over, whatever their stored status.
  select count(*) into v_count from public.table_sessions s
  where s.restaurant_id = p_restaurant_id and s.kind = 'PICKUP' and s.customer_phone = p_phone
    and s.status <> 'CLOSED' and s.started_at >= now() - public.session_ttl();
  if v_count >= v.open_per_phone then
    raise exception 'this phone number already has takeout orders in progress' using errcode = 'PK001';
  end if;

  if p_client_hash is not null then
    select count(*) into v_count from public.table_sessions s
    where s.restaurant_id = p_restaurant_id and s.client_hash = p_client_hash and s.started_at >= now() - v.device_window;
    if v_count >= v.per_device then
      raise exception 'too many takeout orders from this device' using errcode = 'PK002';
    end if;
  end if;

  select count(*) into v_count from public.orders o
  join public.table_sessions s on s.restaurant_id = o.restaurant_id and s.id = o.session_id
  where o.restaurant_id = p_restaurant_id and o.status = 'NEW' and s.kind = 'PICKUP';
  if v_count >= v.waiting_per_restaurant then
    raise exception 'the restaurant has too many takeout orders waiting to be confirmed' using errcode = 'PK003';
  end if;
end $$;
revoke all on function public.check_pickup_limits(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pickup_limits() from public, anon, authenticated;
grant execute on function public.check_pickup_limits(uuid, text, text), public.pickup_limits() to service_role;

-- ─── place_order: as before, plus the limits (and the device hash) when a pickup visit starts ─────────
-- Payload "pickup": { "customer_name", "customer_phone", "client_hash" (optional) }.
create or replace function public.place_order(p_order jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order_id      uuid := (p_order ->> 'id')::uuid;
  v_restaurant_id uuid := (p_order ->> 'restaurant_id')::uuid;
  v_session_id    uuid := (p_order ->> 'session_id')::uuid;
  v_request_id    uuid := (p_order ->> 'client_request_id')::uuid;
  v_pickup        jsonb := p_order -> 'pickup';
  v_stored_id     uuid;
  v_item          jsonb;
  v_item_pos      bigint;
  v_item_id       uuid;
  v_option        jsonb;
  v_option_pos    bigint;
begin
  if jsonb_typeof(p_order -> 'items') is distinct from 'array' or jsonb_array_length(p_order -> 'items') = 0 then
    raise exception 'an order needs at least one line' using errcode = '23514';
  end if;

  if jsonb_typeof(v_pickup) = 'object' then
    if not exists (select 1 from public.restaurant_settings st where st.restaurant_id = v_restaurant_id and st.takeout_enabled) then
      raise exception 'takeout is switched off for this restaurant' using errcode = '23514';
    end if;
    -- The limits apply to a visit that would START now. A submission that arrives twice finds its visit and is
    -- not counted again.
    if not exists (select 1 from public.table_sessions s where s.id = v_session_id) then
      perform public.check_pickup_limits(v_restaurant_id, v_pickup ->> 'customer_phone', v_pickup ->> 'client_hash');
    end if;
    insert into public.table_sessions (id, restaurant_id, kind, customer_name, customer_phone, client_hash)
    values (v_session_id, v_restaurant_id, 'PICKUP', v_pickup ->> 'customer_name', v_pickup ->> 'customer_phone', v_pickup ->> 'client_hash')
    on conflict (id) do nothing;
    if not public.is_pickup_session(v_restaurant_id, v_session_id) then
      raise exception 'this visit is not a pickup visit of this restaurant' using errcode = '23514';
    end if;
  end if;

  insert into public.orders (
    id, restaurant_id, session_id, number, status,
    subtotal_fils, service_charge_fils, tax_fils, total_fils,
    tax_rate_bp, service_charge_bp, created_at, status_changed_at, client_request_id
  ) values (
    v_order_id, v_restaurant_id, v_session_id, (p_order ->> 'number')::integer, 'NEW',
    (p_order ->> 'subtotal_fils')::bigint, (p_order ->> 'service_charge_fils')::bigint,
    (p_order ->> 'tax_fils')::bigint, (p_order ->> 'total_fils')::bigint,
    (p_order ->> 'tax_rate_bp')::integer, (p_order ->> 'service_charge_bp')::integer,
    (p_order ->> 'created_at')::timestamptz, (p_order ->> 'created_at')::timestamptz, v_request_id
  )
  on conflict (restaurant_id, session_id, client_request_id) where client_request_id is not null do nothing
  returning id into v_stored_id;

  if v_stored_id is null then
    select o.id into v_stored_id
    from public.orders o
    where o.restaurant_id = v_restaurant_id and o.session_id = v_session_id and o.client_request_id = v_request_id;
    return v_stored_id;
  end if;

  for v_item, v_item_pos in
    select value, ordinality - 1 from jsonb_array_elements(p_order -> 'items') with ordinality
  loop
    v_item_id := (v_item ->> 'id')::uuid;
    insert into public.order_items (
      id, restaurant_id, order_id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils, position
    ) values (
      v_item_id, v_restaurant_id, v_order_id, (v_item ->> 'menu_item_id')::uuid,
      v_item ->> 'name_en', v_item ->> 'name_ar',
      (v_item ->> 'unit_price_fils')::bigint, (v_item ->> 'quantity')::integer, (v_item ->> 'line_total_fils')::bigint,
      v_item_pos
    );

    for v_option, v_option_pos in
      select value, ordinality - 1 from jsonb_array_elements(coalesce(v_item -> 'options', '[]'::jsonb)) with ordinality
    loop
      insert into public.order_item_options (
        restaurant_id, order_item_id, option_id, group_name_en, group_name_ar, name_en, name_ar, price_delta_fils, position
      ) values (
        v_restaurant_id, v_item_id, (v_option ->> 'option_id')::uuid,
        v_option ->> 'group_name_en', v_option ->> 'group_name_ar',
        v_option ->> 'name_en', v_option ->> 'name_ar', (v_option ->> 'price_delta_fils')::bigint,
        v_option_pos
      );
    end loop;
  end loop;

  return v_order_id;
end $$;

revoke all on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;

-- ─── The cashier may cancel a takeout order ─────────────────────────────
-- Row policy: on a PICKUP order the cashier may now write every status, CANCELLED included.
drop policy "staff move orders by role" on public.orders;
create policy "staff move orders by role" on public.orders
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER','CASHIER']::public.app_role[]))
  with check (
    public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[])
    or (public.has_restaurant_role(restaurant_id, array['WAITER']::public.app_role[]) and status <> 'COMPLETED')
    or (public.has_restaurant_role(restaurant_id, array['CASHIER']::public.app_role[])
        and (status = 'COMPLETED' or public.is_pickup_session(restaurant_id, session_id)))
  );

-- Status trigger: unchanged except for who may cancel (the cashier, on a pickup order, at any step before COMPLETED).
create or replace function public.orders_enforce_status_flow() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_flow constant public.order_status[] :=
    array['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']::public.order_status[];
begin
  if new.status is distinct from old.status then
    if new.status = 'CANCELLED' then
      if old.status = 'COMPLETED' then
        raise exception 'a completed order cannot be cancelled' using errcode = '23514';
      end if;
      if new.cancel_reason is null then
        raise exception 'a cancelled order needs a reason' using errcode = '23514';
      end if;
      -- Who may: owner and manager always; the waiter only before the kitchen starts; the cashier only a takeout
      -- order. (auth.uid() is null for the server itself, which is trusted.)
      if auth.uid() is not null
         and not public.has_restaurant_role(new.restaurant_id, array['OWNER', 'MANAGER']::public.app_role[])
         and not (public.has_restaurant_role(new.restaurant_id, array['WAITER']::public.app_role[])
                  and old.status in ('NEW', 'CONFIRMED'))
         and not (public.has_restaurant_role(new.restaurant_id, array['CASHIER']::public.app_role[])
                  and public.is_pickup_session(new.restaurant_id, new.session_id)) then
        raise exception 'this role cannot cancel an order that is %', old.status using errcode = '42501';
      end if;
      new.cancelled_at := now();
      new.cancelled_by := auth.uid();
    else
      if new.status is distinct from v_flow[array_position(v_flow, old.status) + 1] then
        raise exception 'order status cannot go from % to %', old.status, new.status using errcode = '23514';
      end if;
    end if;
    new.status_changed_at := now();
  elsif (new.cancel_reason, new.cancelled_at, new.cancelled_by) is distinct from (old.cancel_reason, old.cancelled_at, old.cancelled_by) then
    raise exception 'the cancellation of an order cannot be changed' using errcode = '23514';
  end if;
  return new;
end $$;
