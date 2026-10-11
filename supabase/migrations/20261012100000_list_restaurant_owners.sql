-- Phase 6 step 1 part D2 (database): the founders' setup tool can see who owns each restaurant.
--
-- Needed to issue a new temporary password for an owner (a password notice that was closed too early, a forgotten
-- password): the tool has to show the owner's email, and must be able to check that the account it is asked to
-- reset really is an OWNER of that restaurant, never just any account.
--
-- Emails live in auth.users, which nobody but the database owner can read. This function hands out exactly three
-- columns, for OWNER memberships only, and only to the server acting for a founder (checked here again, as in
-- create_restaurant).
--   p_actor_id       the signed-in founder
--   p_restaurant_id  one restaurant, or NULL for all of them
-- Fails with 42501 when the actor is not a founder.
create function public.list_restaurant_owners(p_actor_id uuid, p_restaurant_id uuid default null)
returns table (restaurant_id uuid, user_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor_id is null or not exists (select 1 from public.platform_admins a where a.user_id = p_actor_id) then
    raise exception 'only a platform admin can list restaurant owners' using errcode = '42501';
  end if;

  return query
    select m.restaurant_id, m.user_id, u.email::text
    from public.restaurant_members m
    join auth.users u on u.id = m.user_id
    where m.role = 'OWNER'
      and (p_restaurant_id is null or m.restaurant_id = p_restaurant_id)
    order by m.restaurant_id, m.created_at, m.user_id;
end $$;

revoke all on function public.list_restaurant_owners(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_restaurant_owners(uuid, uuid) to service_role;
