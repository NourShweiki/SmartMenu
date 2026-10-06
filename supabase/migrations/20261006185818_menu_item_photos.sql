-- Phase 3 step 8: one photo per menu item (decided 2026-10-06: JPG/PNG/WebP, max 5 MB,
-- owner/manager upload, publicly viewable because customers see them on the menu).

-- ─── Column ─────────────────────────────────────────────────────────────
-- Path inside the bucket: "<restaurantId>/<itemId>/<file>.<ext>" (src/domain/menu/photo.ts).
alter table public.menu_items add column image_path text
  check (image_path is null or image_path like restaurant_id::text || '/' || id::text || '/%');
grant update (image_path) on public.menu_items to authenticated;

-- ─── Bucket ─────────────────────────────────────────────────────────────
-- Public = anyone can VIEW a photo by its URL (needed for the customer menu).
-- Size and type limits are enforced by Storage itself, in addition to the app's checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- ─── Who may write ──────────────────────────────────────────────────────
-- The first folder of the object name is the restaurant id. Only that restaurant's
-- OWNER/MANAGER may upload, replace, list or delete there. Returns null for junk names.
create function public.menu_image_restaurant_id(object_name text)
returns uuid
language sql immutable set search_path = '' as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end;
$$;

create policy "menu images: managers read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'menu-images'
         and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER','MANAGER']::public.app_role[]));

create policy "menu images: managers upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images'
              and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER','MANAGER']::public.app_role[]));

create policy "menu images: managers replace in own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images'
         and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER','MANAGER']::public.app_role[]))
  with check (bucket_id = 'menu-images'
              and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER','MANAGER']::public.app_role[]));

create policy "menu images: managers delete in own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images'
         and public.has_restaurant_role(public.menu_image_restaurant_id(name), array['OWNER','MANAGER']::public.app_role[]));
