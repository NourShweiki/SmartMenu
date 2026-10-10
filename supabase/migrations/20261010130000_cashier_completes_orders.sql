-- Who may move an order to which status (decided by Nour 2026-10-10):
--   OWNER / MANAGER  any next step (they hold both orders:confirm and payments:close)
--   WAITER           NEW -> ... -> SERVED (orders:confirm), but NOT the final COMPLETED step
--   CASHIER          only SERVED -> COMPLETED, after the customer has paid (payments:close)
-- The database's status-flow trigger still allows exactly one step forward for everybody, so a cashier can
-- never skip ahead: the only order a cashier can move is one that is already SERVED.
-- (Recording the payment itself comes with the table-session / payment step.)

drop policy "order handlers move orders" on public.orders;

create policy "staff move orders by role" on public.orders
  for update to authenticated
  using (public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER','WAITER','CASHIER']::public.app_role[]))
  with check (
    public.has_restaurant_role(restaurant_id, array['OWNER','MANAGER']::public.app_role[])
    or (public.has_restaurant_role(restaurant_id, array['WAITER']::public.app_role[]) and status <> 'COMPLETED')
    or (public.has_restaurant_role(restaurant_id, array['CASHIER']::public.app_role[]) and status = 'COMPLETED')
  );
