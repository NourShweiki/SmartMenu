-- Item notes (PROJECT_SPEC.md §3.3, Nour 2026-11-27): the owner or manager allows a short customer note on an item
-- ("less sugar"); the note is saved with the order line, as typed, and shown to staff. It never changes the price.

-- The item's switch: off unless switched on. Changed like the other item fields (menu:manage: owner, manager).
alter table public.menu_items
  add column allows_note boolean not null default false;
grant update (allows_note) on public.menu_items to authenticated;

-- The note on an order line: at most 100 characters (the app cleans it first: no line breaks, trimmed, never empty).
-- Written only by place_order (service role); staff read it with the rest of the order (existing select grant).
alter table public.order_items
  add column note text,
  add constraint order_items_note_length check (note is null or char_length(note) between 1 and 100);

-- place_order: unchanged except that each line stores its note, and refuses one on an item that takes none.
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
    -- A note only where the item takes one (the server checked it against the live menu; checked again here).
    if nullif(v_item ->> 'note', '') is not null and not exists (
      select 1 from public.menu_items mi
      where mi.restaurant_id = v_restaurant_id and mi.id = (v_item ->> 'menu_item_id')::uuid and mi.allows_note
    ) then
      raise exception 'this item does not take a note' using errcode = '23514';
    end if;
    insert into public.order_items (
      id, restaurant_id, order_id, menu_item_id, name_en, name_ar, unit_price_fils, quantity, line_total_fils, position, note
    ) values (
      v_item_id, v_restaurant_id, v_order_id, (v_item ->> 'menu_item_id')::uuid,
      v_item ->> 'name_en', v_item ->> 'name_ar',
      (v_item ->> 'unit_price_fils')::bigint, (v_item ->> 'quantity')::integer, (v_item ->> 'line_total_fils')::bigint,
      v_item_pos, nullif(v_item ->> 'note', '')
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

-- The public menu tells the customer's page which items take a note (one more key per item).
create or replace function public.get_public_menu(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t.category order by t.sort_order, t.id), '[]'::jsonb)
  from (
    select c.id, c.sort_order,
      jsonb_build_object(
        'id', c.id, 'name_en', c.name_en, 'name_ar', c.name_ar, 'sort_order', c.sort_order,
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', i.id, 'name_en', i.name_en, 'name_ar', i.name_ar,
              'description_en', i.description_en, 'description_ar', i.description_ar,
              'price_fils', i.price_fils, 'sort_order', i.sort_order,
              'is_sold_out', i.is_sold_out, 'image_path', i.image_path, 'allows_note', i.allows_note,
              'option_groups', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', g.id, 'name_en', g.name_en, 'name_ar', g.name_ar,
                    'min_select', g.min_select, 'max_select', g.max_select, 'sort_order', l.sort_order,
                    'options', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'id', o.id, 'name_en', o.name_en, 'name_ar', o.name_ar,
                          'price_delta_fils', o.price_delta_fils, 'sort_order', o.sort_order
                        ) order by o.sort_order, o.id)
                      from public.options o
                      where o.restaurant_id = r.id and o.group_id = g.id and o.deleted_at is null
                    ), '[]'::jsonb)
                  ) order by l.sort_order, g.id)
                from public.menu_item_option_groups l
                join public.option_groups g on g.restaurant_id = l.restaurant_id and g.id = l.group_id
                where l.restaurant_id = r.id and l.item_id = i.id and g.deleted_at is null
              ), '[]'::jsonb)
            ) order by i.sort_order, i.id)
          from public.menu_items i
          where i.restaurant_id = r.id and i.category_id = c.id and i.deleted_at is null and not i.is_hidden
        ), '[]'::jsonb)
      ) as category
    from public.restaurants r
    join public.menu_categories c on c.restaurant_id = r.id and c.deleted_at is null and not c.is_hidden
    where r.slug = lower(trim(p_slug))
  ) t;
$$;
