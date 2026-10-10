-- Phase 3 step 12: restaurant branding (mirrors src/domain/restaurant/branding.ts).
-- The owner edits a logo, ONE accent colour from a fixed palette, and written details (decided with Nour
-- 2026-10-10). The data lives in restaurant_settings.branding (jsonb, already there) and, for the name,
-- in restaurants. Branding is shown to everyone on the restaurant's public page, so it is part of the
-- public read function; every key of it is meant to be public.

-- ─── Keep the jsonb small and the logo inside the restaurant's own folder ───────────────
alter table public.restaurant_settings
  add constraint branding_is_small_object check (jsonb_typeof(branding) = 'object' and octet_length(branding::text) <= 8000),
  add constraint branding_logo_in_own_folder
    check (branding ->> 'logoPath' is null or branding ->> 'logoPath' like restaurant_id::text || '/%');

-- ─── Logo bucket ────────────────────────────────────────────────────────
-- Public = anyone can VIEW a logo by its URL (customers see it). Size and type limits are enforced by Storage
-- itself, in addition to the app's checks. No SVG: it can carry scripts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-logos', 'restaurant-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

-- Same folder rule as menu photos (first folder = restaurant id; menu_image_restaurant_id() parses it),
-- but ONLY the OWNER may write: branding is part of restaurant:settings (role.ts).
create policy "logos: owner reads own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'restaurant-logos'
         and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER']::public.app_role[]));

create policy "logos: owner uploads to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'restaurant-logos'
              and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER']::public.app_role[]));

create policy "logos: owner replaces in own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'restaurant-logos'
         and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER']::public.app_role[]))
  with check (bucket_id = 'restaurant-logos'
              and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER']::public.app_role[]));

create policy "logos: owner deletes in own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-logos'
         and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER']::public.app_role[]));

-- ─── Save name + branding together ──────────────────────────────────────
-- SECURITY INVOKER: it runs as the signed-in user, so RLS and the column grants apply exactly as for direct
-- updates (only the OWNER, only name_en / name_ar and the branding column). Being ONE function it is atomic:
-- if the branding row cannot be written, the name change is rolled back too.
create function public.update_restaurant_branding(
  p_restaurant_id uuid, p_name_en text, p_name_ar text, p_branding jsonb
) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.restaurants set name_en = p_name_en, name_ar = p_name_ar where id = p_restaurant_id;
  if not found then
    return false; -- no such restaurant for this user (RLS hides it, or only the owner may update)
  end if;
  update public.restaurant_settings set branding = p_branding where restaurant_id = p_restaurant_id;
  if not found then
    raise exception 'branding could not be saved' using errcode = '42501';
  end if;
  return true;
end $$;

revoke all on function public.update_restaurant_branding(uuid, text, text, jsonb) from public, anon;
grant execute on function public.update_restaurant_branding(uuid, text, text, jsonb) to authenticated, service_role;

-- ─── Public read: add branding ──────────────────────────────────────────
-- The column list IS the security boundary (SECURITY DEFINER bypasses RLS): `branding` was added on purpose,
-- because every key in it (colour, logo path, tagline, about, address, phone, opening hours) is public.
drop function public.get_public_restaurant(text);

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
  default_language  text,
  branding          jsonb
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.slug, r.name_en, r.name_ar,
         s.dine_in_enabled, s.takeout_enabled, s.delivery_enabled,
         s.tax_rate_bp, s.service_charge_bp, s.default_language,
         s.branding
  from public.restaurants r
  join public.restaurant_settings s on s.restaurant_id = r.id
  where r.slug = lower(trim(p_slug));
$$;

revoke all on function public.get_public_restaurant(text) from public;
grant execute on function public.get_public_restaurant(text) to anon, authenticated, service_role;
