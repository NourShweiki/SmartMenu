-- Guests see the orders of their own table visit (Phase 5 step 6: "your order is ready" on the phones at the table).
--
-- Customers have no accounts and no access to the orders table. This is the one narrow way in, like the other
-- public functions: SECURITY DEFINER, a fixed list of fields, and it answers only for the session whose id the
-- caller already holds. That id is the secret: 122 random bits, handed to the phone by the server when the table's
-- QR code is scanned and kept in an HttpOnly cookie (the page's scripts never see it; the server reads it and
-- calls this function).
--
-- Returns a jsonb ARRAY (oldest first), one object per order of that session:
--   { number, status, placed_at, total_fils, items: [ { name_en, name_ar, quantity } ] }
-- and '[]' when the session is unknown or belongs to another restaurant (no difference is shown).
-- Deliberately NOT returned: any id, prices of single lines, the chosen options, who cancelled or why, anything
-- about the restaurant or other tables. A cancelled order is included (status CANCELLED): guests must see it.

create function public.get_public_session_orders(p_slug text, p_session_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'number', o.number,
        'status', o.status,
        'placed_at', o.created_at,
        'total_fils', o.total_fils,
        'items', (
          select coalesce(
            jsonb_agg(jsonb_build_object('name_en', i.name_en, 'name_ar', i.name_ar, 'quantity', i.quantity) order by i.position, i.id),
            '[]'::jsonb)
          from public.order_items i
          where i.restaurant_id = o.restaurant_id and i.order_id = o.id
        )
      )
      order by o.created_at, o.number
    ),
    '[]'::jsonb)
  from public.orders o
  join public.table_sessions s on s.restaurant_id = o.restaurant_id and s.id = o.session_id
  join public.restaurants r on r.id = o.restaurant_id
  where r.slug = lower(trim(p_slug)) and s.id = p_session_id;
$$;

revoke all on function public.get_public_session_orders(text, uuid) from public;
grant execute on function public.get_public_session_orders(text, uuid) to anon, authenticated, service_role;
