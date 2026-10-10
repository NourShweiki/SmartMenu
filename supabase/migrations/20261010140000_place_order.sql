-- Phase 4 step 3: place an order (order + lines + picked options) in ONE transaction.
-- A function is atomic, so a failed line (bad price, foreign-restaurant item ...) leaves no half-written order.
-- Only the server may call it (service_role): the amounts come from the domain (createOrder), which has already
-- checked the live menu, the option rules and the totals. The table constraints re-check what they can
-- (total = subtotal + service + tax, line total >= unit x qty, tenant foreign keys, unique order number).
-- The customer-facing path that opens this to anonymous visitors (after validating the table session) is a later step.
--
-- Payload shape (jsonb):
--   { id, restaurant_id, session_id, number, tax_rate_bp, service_charge_bp,
--     subtotal_fils, service_charge_fils, tax_fils, total_fils, created_at,
--     items: [ { id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils,
--                options: [ { option_id, group_name_en, group_name_ar, name_en, name_ar, price_delta_fils } ] } ] }
-- Lines and options keep the order of their arrays (stored as `position`).

create function public.place_order(p_order jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order_id      uuid := (p_order ->> 'id')::uuid;
  v_restaurant_id uuid := (p_order ->> 'restaurant_id')::uuid;
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
    tax_rate_bp, service_charge_bp, created_at, status_changed_at
  ) values (
    v_order_id, v_restaurant_id, (p_order ->> 'session_id')::uuid, (p_order ->> 'number')::integer, 'NEW',
    (p_order ->> 'subtotal_fils')::bigint, (p_order ->> 'service_charge_fils')::bigint,
    (p_order ->> 'tax_fils')::bigint, (p_order ->> 'total_fils')::bigint,
    (p_order ->> 'tax_rate_bp')::integer, (p_order ->> 'service_charge_bp')::integer,
    (p_order ->> 'created_at')::timestamptz, (p_order ->> 'created_at')::timestamptz
  );

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
