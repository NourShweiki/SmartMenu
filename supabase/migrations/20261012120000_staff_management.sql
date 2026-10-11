-- Phase 6 step 2 part A (database): what the owner's "staff" screen needs.
--
-- The rules (Nour, 2026-10-12: "go ahead with these rules"; PROJECT_SPEC.md section 7):
--   * The owner and the manager manage a restaurant's staff (role.ts `staff:manage`; the row policies of Phase 2
--     already say so, and already keep the OWNER role for owners).
--   * Nobody changes or removes THEMSELVES.
--   * A restaurant is never left without an owner.
--   * An email that already has an account is only taken on when that account belongs to no restaurant any more
--     (somebody who was removed and is hired again). An account that works elsewhere is refused: adding it would
--     let this restaurant reset a password that opens the other one.
--   * Removing somebody takes them out of the restaurant; their account stays (past orders still know who
--     cancelled them).
--
-- Adding, changing and removing a member are plain writes on restaurant_members as the signed-in owner / manager:
-- the row policies decide, and the trigger below adds the two rules they cannot express. What is new here is
-- reading: staff emails live in auth.users, which no signed-in user can read.

-- ─── Nobody changes or removes themselves; a restaurant keeps an owner ──
-- SECURITY DEFINER so it sees every owner row whatever the caller may read, and can lock them.
create function public.restaurant_members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_other_owners integer;
begin
  -- The restaurant itself is being deleted (its members go with it): nothing to protect.
  if not exists (select 1 from public.restaurants r where r.id = old.restaurant_id) then
    return coalesce(new, old);
  end if;

  -- A signed-in person acting on their own membership. (The server acting without a user has no auth.uid().)
  if (select auth.uid()) = old.user_id then
    raise exception 'staff cannot change or remove their own membership' using errcode = '42501';
  end if;

  if old.role = 'OWNER' and (tg_op = 'DELETE' or new.role <> 'OWNER') then
    -- Lock the restaurant's owner rows, so two owners removing each other at the same moment cannot both succeed.
    perform 1 from public.restaurant_members m
      where m.restaurant_id = old.restaurant_id and m.role = 'OWNER' for update;
    select count(*) into v_other_owners from public.restaurant_members m
      where m.restaurant_id = old.restaurant_id and m.role = 'OWNER' and m.id <> old.id;
    if v_other_owners = 0 then
      raise exception 'a restaurant must keep at least one owner' using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end $$;

create trigger restaurant_members_guard before update of role or delete on public.restaurant_members
  for each row execute function public.restaurant_members_guard();

-- ─── The staff list, with emails ────────────────────────────────────────
-- For the owner and the manager of THAT restaurant only (checked against the caller's own session); anybody else
-- gets 42501. Owners first, then managers, waiters, cashiers; within a role in the order they joined.
create function public.list_restaurant_staff(p_restaurant_id uuid)
returns table (user_id uuid, role public.app_role, email text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_restaurant_role(p_restaurant_id, array['OWNER', 'MANAGER']::public.app_role[]) then
    raise exception 'only the owner or a manager can list the staff' using errcode = '42501';
  end if;

  return query
    select m.user_id, m.role, u.email::text, m.created_at
    from public.restaurant_members m
    join auth.users u on u.id = m.user_id
    where m.restaurant_id = p_restaurant_id
    order by m.role, m.created_at, m.user_id;
end $$;

revoke all on function public.list_restaurant_staff(uuid) from public, anon;
grant execute on function public.list_restaurant_staff(uuid) to authenticated, service_role;

-- ─── Server-only helpers for making and resetting staff accounts ────────
-- Accounts are made and given passwords through the auth admin API with the service-role key, which could touch
-- ANY account. These two functions are what keeps that power inside one restaurant: the server asks them before it
-- acts, and they check the acting person again (p_actor_id must be an owner or manager of p_restaurant_id).

create function public.assert_staff_manager(p_actor_id uuid, p_restaurant_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor_id is null or not exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = p_restaurant_id and m.user_id = p_actor_id and m.role in ('OWNER', 'MANAGER')
  ) then
    raise exception 'only the owner or a manager can manage the staff' using errcode = '42501';
  end if;
end $$;

-- The account behind an email, IF it may be taken on as new staff: it exists, belongs to no restaurant, and is not
-- a founder's. NULL otherwise (no such account, or one that must not be touched: the caller cannot tell which).
create function public.find_unattached_account(p_actor_id uuid, p_restaurant_id uuid, p_email text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid;
begin
  perform public.assert_staff_manager(p_actor_id, p_restaurant_id);

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and not exists (select 1 from public.restaurant_members m where m.user_id = u.id)
    and not exists (select 1 from public.platform_admins a where a.user_id = u.id);
  return v_user_id;
end $$;

-- Whether p_user_id's password may be replaced from this restaurant's staff screen: a member of this restaurant
-- who is not an owner (owners are reset by the founders), not the acting person, works nowhere else, not a founder.
create function public.is_resettable_staff_account(p_actor_id uuid, p_restaurant_id uuid, p_user_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_staff_manager(p_actor_id, p_restaurant_id);

  return p_user_id is distinct from p_actor_id
    and exists (
      select 1 from public.restaurant_members m
      where m.restaurant_id = p_restaurant_id and m.user_id = p_user_id and m.role <> 'OWNER')
    and not exists (
      select 1 from public.restaurant_members m
      where m.user_id = p_user_id and m.restaurant_id <> p_restaurant_id)
    and not exists (select 1 from public.platform_admins a where a.user_id = p_user_id);
end $$;

revoke all on function public.assert_staff_manager(uuid, uuid) from public, anon, authenticated;
revoke all on function public.find_unattached_account(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.is_resettable_staff_account(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.assert_staff_manager(uuid, uuid) to service_role;
grant execute on function public.find_unattached_account(uuid, uuid, text) to service_role;
grant execute on function public.is_resettable_staff_account(uuid, uuid, uuid) to service_role;
