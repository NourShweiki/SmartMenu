-- Placing an order becomes safe to repeat (review finding of step 4c, approved by Nour 2026-10-11).
--
-- The problem: a guest presses "Place order", the server stores the order, and the reply is lost on the way back
-- (weak restaurant Wi-Fi). The phone shows "could not send", the guest presses again, and the kitchen gets the same
-- order twice.
--
-- The cure: the phone makes up one random key per submission and sends the SAME key when it retries. An order
-- remembers the key it was placed with, and within one table session a key can only be used once. Placing an order
-- with a key that was already used does not fail: it stores nothing and hands back the order that is already there,
-- so the retry simply gets the first order's number.
--
-- The key is optional (null = no protection, as before): orders placed by other paths do not need one.
-- Nulls never clash with each other (the index only covers rows that have a key).

alter table public.orders add column client_request_id uuid;

comment on column public.orders.client_request_id is
  'Random key the customer''s device made up for this submission; a retry sends the same key. Unique per table session.';

create unique index orders_client_request_key
  on public.orders (restaurant_id, session_id, client_request_id)
  where client_request_id is not null;

-- ─── place_order: same as before, plus the key ──────────────────────────
-- Returns the id of the order that now exists for this request: the new one, or the earlier one when the key was
-- already used in this session (in that case nothing is written, not even lines). Two submissions with the same key
-- arriving at the same moment are safe too: the second waits for the first and then finds its order.
-- Payload: as before, plus the optional `client_request_id`.

create or replace function public.place_order(p_order jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order_id      uuid := (p_order ->> 'id')::uuid;
  v_restaurant_id uuid := (p_order ->> 'restaurant_id')::uuid;
  v_session_id    uuid := (p_order ->> 'session_id')::uuid;
  v_request_id    uuid := (p_order ->> 'client_request_id')::uuid;
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
