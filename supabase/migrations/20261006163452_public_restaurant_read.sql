-- Phase 2 step 3: the one public read path for restaurants.
-- Customers (anon) never touch the tables directly. They look up ONE restaurant by its
-- slug and get only fields a customer may see: no staff, no branding internals, no timestamps.
-- SECURITY DEFINER bypasses RLS, so the column list below IS the security boundary:
-- add a column here only if it is safe to show to anyone on the internet.

create function public.get_public_restaurant(p_slug text)
returns table (
  id                uuid,
  slug              text,
  name_en           text,
  name_ar           text,
  dine_in_enabled   boolean,
  takeout_enabled   boolean,
  delivery_enabled  boolean,
  tax_rate_bp       integer,
  service_charge_bp integer,
  default_language  text
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.slug, r.name_en, r.name_ar,
         s.dine_in_enabled, s.takeout_enabled, s.delivery_enabled,
         s.tax_rate_bp, s.service_charge_bp, s.default_language
  from public.restaurants r
  join public.restaurant_settings s on s.restaurant_id = r.id
  where r.slug = lower(trim(p_slug));
$$;

revoke all on function public.get_public_restaurant(text) from public;
grant execute on function public.get_public_restaurant(text) to anon, authenticated, service_role;
