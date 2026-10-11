-- Phase 6 step 3 part A (database): takeout. The design is in PROJECT_SPEC.md section 4, "Takeout design".
--
-- A takeout order belongs to a PICKUP VISIT: the same thing as a table session, without a table. Instead of a table
-- it carries the customer's name and mobile number. Everything built around table sessions (orders, the customer's
-- "your orders", the ready notice, the staff queue) keeps working on it unchanged.
--
--   * A pickup visit starts when its FIRST ORDER is placed, in the same transaction: it never exists without one.
--   * It ends by itself when its last order is completed or cancelled.
--   * While it is open (and inside the usual 2 hours) the same customer can order again into it.
--   * On a pickup order the CASHIER may do every step: a takeout counter is often run by the cashier alone.
--     Cancelling stays with the owner, the manager and (before the kitchen starts) the waiter, as for tables.

-- ─── A session is a table visit or a pickup visit ───────────────────────
create type public.session_kind as enum ('TABLE', 'PICKUP');

alter table public.table_sessions
  alter column table_id drop not null,
  add column kind            public.session_kind not null default 'TABLE',
  add column customer_name   text,
  add column customer_phone  text,
  -- A table visit has a table and no customer; a pickup visit has a customer and no table.
  -- Name: tidy (no outer or doubled spaces), no control characters or markup (mirrors validateCustomerName).
  -- Phone: a Jordanian mobile in international form, +9627 7/8/9 and seven more digits (normalizeJordanMobile).
  add constraint table_sessions_kind_shape check (
    (kind = 'TABLE' and table_id is not null and customer_name is null and customer_phone is null)
    or (kind = 'PICKUP' and table_id is null
        and customer_name is not null
        and char_length(customer_name) between 1 and 60
        and customer_name = regexp_replace(btrim(customer_name), '\s+', ' ', 'g')
        and customer_name !~ '[[:cntrl:]<>]'
        and customer_phone is not null
        and customer_phone ~ '^\+9627[789][0-9]{7}$')
  );

comment on column public.table_sessions.kind is 'TABLE = guests at a table (table_id set); PICKUP = a takeout customer (customer_name, customer_phone set).';

-- The staff queue asks for the pickup visits of a restaurant, newest first.
create index table_sessions_pickup_idx on public.table_sessions (restaurant_id, started_at desc) where kind = 'PICKUP';

create function public.is_pickup_session(p_restaurant_id uuid, p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.table_sessions s
    where s.restaurant_id = p_restaurant_id and s.id = p_session_id and s.kind = 'PICKUP');
$$;
revoke all on function public.is_pickup_session(uuid, uuid) from public, anon;
grant execute on function public.is_pickup_session(uuid, uuid) to authenticated, service_role;

-- ─── Who moves an order: the cashier may do every step on a pickup order ─
-- Unchanged for tables: OWNER / MANAGER any step, WAITER up to SERVED, CASHIER only COMPLETED. New: on a PICKUP
-- order the CASHIER may write every status of the flow (the status trigger still allows only one step forward at a
-- time), but not CANCELLED.
drop policy "staff move orders by role" on public.orders;
create policy "staff move orders by role" on public.orders
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER','CASHIER']::public.app_role[]))
  with check (
    public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[])
    or (public.has_restaurant_role(restaurant_id, array['WAITER']::public.app_role[]) and status <> 'COMPLETED')
    or (public.has_restaurant_role(restaurant_id, array['CASHIER']::public.app_role[])
        and (status = 'COMPLETED'
             or (status <> 'CANCELLED' and public.is_pickup_session(restaurant_id, session_id))))
  );

-- ─── A pickup visit ends with its last order ────────────────────────────
-- SECURITY DEFINER: whoever finished the order (a waiter cancelling, say) need not be allowed to close visits.
create function public.orders_close_finished_pickup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('COMPLETED', 'CANCELLED') and new.status is distinct from old.status then
    update public.table_sessions s set status = 'CLOSED'
    where s.restaurant_id = new.restaurant_id and s.id = new.session_id
      and s.kind = 'PICKUP' and s.status <> 'CLOSED'
      and not exists (
        select 1 from public.orders o
        where o.restaurant_id = new.restaurant_id and o.session_id = new.session_id
          and o.status not in ('COMPLETED', 'CANCELLED'));
  end if;
  return null;
end $$;

create trigger orders_close_finished_pickup after update of status on public.orders
  for each row execute function public.orders_close_finished_pickup();

-- ─── What the customer's phone may know about its visit ─────────────────
-- As before for a table visit; a pickup visit has no table, so the join became a LEFT join, and the answer now says
-- which kind it is and, for a pickup visit, the name the order is under. Never the phone number.
create or replace function public.get_public_session(p_slug text, p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'session_id', s.id,
    'kind', s.kind,
    'table_label', t.label,
    'customer_name', s.customer_name,
    'status', case when s.status <> 'CLOSED' and s.started_at < now() - public.session_ttl() then 'CLOSED' else s.status end
  )
  from public.table_sessions s
  left join public.restaurant_tables t on t.restaurant_id = s.restaurant_id and t.id = s.table_id
  join public.restaurants r on r.id = s.restaurant_id
  where r.slug = lower(trim(p_slug)) and s.id = p_session_id;
$$;

-- ─── place_order: as before, plus starting a pickup visit ───────────────
-- Payload: as before, plus the optional
--   "pickup": { "customer_name": ..., "customer_phone": ... }
-- With it, the order's session (p_order.session_id) is CREATED as a pickup visit in this same transaction, unless
-- it is already there: the server uses the customer's own submission key as the visit's id, so a submission that
-- arrives twice finds its visit, and then its order by the key, and stores nothing new. Refused (23514, nothing
-- stored) when takeout is switched off, or when that id belongs to something that is not a pickup visit of this
-- restaurant. Without "pickup" nothing changes: the session must exist, as before.
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
    insert into public.table_sessions (id, restaurant_id, kind, customer_name, customer_phone)
    values (v_session_id, v_restaurant_id, 'PICKUP', v_pickup ->> 'customer_name', v_pickup ->> 'customer_phone')
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
  -- Only a repeated key is forgiven. Any other clash (the order number, the id) still fails as before.
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

-- Unchanged, restated so this file says it all: only the server may call it.
revoke all on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;
