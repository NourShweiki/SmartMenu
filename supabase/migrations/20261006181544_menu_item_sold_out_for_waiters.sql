-- Waiters may mark items sold out / back in stock during service (decided 2026-10-06,
-- role.ts "menu:sold-out": OWNER, MANAGER, WAITER). They must not change anything else,
-- and RLS can't restrict columns per role, so this narrow function is their only write path.
-- Owner/manager can still also update is_sold_out directly (existing policy).

create function public.set_menu_item_sold_out(p_item_id uuid, p_sold_out boolean)
returns boolean -- true if the item was found and updated
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant_id uuid;
begin
  select restaurant_id into v_restaurant_id
  from public.menu_items
  where id = p_item_id and deleted_at is null;

  -- Unknown, deleted, or another restaurant's item: same answer, so nothing leaks.
  if v_restaurant_id is null
     or not public.has_restaurant_role(v_restaurant_id, array['OWNER','MANAGER','WAITER']::public.app_role[]) then
    return false;
  end if;

  update public.menu_items set is_sold_out = p_sold_out where id = p_item_id;
  return true;
end $$;

revoke all on function public.set_menu_item_sold_out(uuid, boolean) from public, anon;
grant execute on function public.set_menu_item_sold_out(uuid, boolean) to authenticated, service_role;
