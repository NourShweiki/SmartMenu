-- Phase 6 step 1 (database): the founders' setup tool can create a restaurant.
--
-- Until now restaurants only came from seed.sql. Onboarding a client needs three rows that belong together: the
-- restaurant, its settings (from the business-type preset, src/domain/restaurant/settings.ts) and its first OWNER.
-- They are written by ONE function, so a client is never left half set up.
--
--   platform_admins     who is a founder (may use the setup tool). Not a restaurant role: it sits above restaurants.
--   create_restaurant   restaurant + settings + owner membership, all or nothing.
--
-- The owner's sign-in account itself is made by the server through the auth admin API before this is called; this
-- function only links an existing account to the new restaurant.

-- ─── Founders ───────────────────────────────────────────────────────────
-- Rows are added BY HAND in the database (Supabase Studio / SQL), never from a screen: there is no insert, update or
-- delete path for anyone but the service role. A signed-in user can see whether THEY are a founder and nothing else.
create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy "a founder reads their own row" on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;

-- ─── create_restaurant ──────────────────────────────────────────────────
-- p_actor_id   the signed-in founder doing this. Checked HERE as well as in the app, so a server path that forgot
--              its own check still cannot create a restaurant.
-- p_restaurant { id, slug, name_en, name_ar,
--                settings: { dine_in_enabled, takeout_enabled, delivery_enabled, tax_rate_bp, service_charge_bp,
--                            default_language } }   every field required
-- p_owner_id   an existing auth user, who becomes the restaurant's OWNER (the same person may own several).
-- Returns the restaurant's id. Fails as a whole (nothing stored) with:
--   42501  the actor is not a founder
--   23505  the slug is taken
--   23514  bad slug or name, no order type switched on, rate out of range
--   23503  the owner account does not exist
--   23502  a field is missing
-- Reserved subdomains (www, api, admin, ...) are refused by the domain rule (validateSlug), not here.
create function public.create_restaurant(p_actor_id uuid, p_restaurant jsonb, p_owner_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id       uuid  := (p_restaurant ->> 'id')::uuid;
  v_settings jsonb := p_restaurant -> 'settings';
begin
  if p_actor_id is null or not exists (select 1 from public.platform_admins a where a.user_id = p_actor_id) then
    raise exception 'only a platform admin can create a restaurant' using errcode = '42501';
  end if;

  insert into public.restaurants (id, slug, name_en, name_ar)
  values (v_id, p_restaurant ->> 'slug', btrim(p_restaurant ->> 'name_en'), btrim(p_restaurant ->> 'name_ar'));

  insert into public.restaurant_settings (
    restaurant_id, dine_in_enabled, takeout_enabled, delivery_enabled, tax_rate_bp, service_charge_bp, default_language
  ) values (
    v_id,
    (v_settings ->> 'dine_in_enabled')::boolean, (v_settings ->> 'takeout_enabled')::boolean,
    (v_settings ->> 'delivery_enabled')::boolean,
    (v_settings ->> 'tax_rate_bp')::integer, (v_settings ->> 'service_charge_bp')::integer,
    v_settings ->> 'default_language'
  );

  insert into public.restaurant_members (restaurant_id, user_id, role) values (v_id, p_owner_id, 'OWNER');

  return v_id;
end $$;

-- Only the server may call it (the setup tool's server action, after checking the founder).
revoke all on function public.create_restaurant(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_restaurant(uuid, jsonb, uuid) to service_role;
