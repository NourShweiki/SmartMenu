-- Phase 4 step 4: the public menu read path (what a customer sees).
-- Customers (anon) never touch the menu tables. They ask for ONE restaurant's menu by its slug and get only what
-- a customer may see: visible categories and items (hidden and deleted ones are left out), sold-out items marked
-- as such, the option groups attached to each item with their live options, and nothing else (no restaurant_id,
-- no timestamps, no deleted_at). SECURITY DEFINER bypasses RLS, so the keys listed below ARE the security
-- boundary: add a key only if it is safe to show to anyone on the internet (the pgTAP test pins them).
--
-- Returns ONE jsonb document (an array of categories) so the whole menu is one round trip:
--   [ { id, name_en, name_ar, sort_order,
--       items: [ { id, name_en, name_ar, description_en, description_ar, price_fils, sort_order, is_sold_out, image_path,
--                  option_groups: [ { id, name_en, name_ar, min_select, max_select, sort_order,
--                                     options: [ { id, name_en, name_ar, price_delta_fils, sort_order } ] } ] } ] } ]
-- Unknown slug -> an empty array.

create function public.get_public_menu(p_slug text) returns jsonb
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
              'is_sold_out', i.is_sold_out, 'image_path', i.image_path,
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

revoke all on function public.get_public_menu(text) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated, service_role;
