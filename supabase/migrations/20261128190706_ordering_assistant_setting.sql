-- The AI ordering chat becomes a per-restaurant SETTING, off by default (PROJECT_SPEC.md §3.3, Nour 2026-11-27:
-- "disable the AI chat for now"). The chat is offered to customers only when this is on AND the server has an AI key.
-- Its code stays; the owner switches it on in Settings.

-- Every restaurant, the existing ones included, starts with the chat OFF.
alter table public.restaurant_settings
  add column ordering_assistant_enabled boolean not null default false;

-- Changed like the other settings: by the owner only (policy "owner updates settings"), column by column
-- (20261010120100_pin_table_privileges.sql pinned the updatable columns).
grant update (ordering_assistant_enabled) on public.restaurant_settings to authenticated;

-- The public read gains the column: the home and menu pages decide from it whether to offer the chat. The return
-- type changes, so the function is dropped and made again, with the same body, checks and grants as before
-- (20261010160000_branding.sql) plus the one column.
drop function public.get_public_restaurant(text);

create function public.get_public_restaurant(p_slug text)
returns table (
  id                         uuid,
  slug                       text,
  name_en                    text,
  name_ar                    text,
  dine_in_enabled            boolean,
  takeout_enabled            boolean,
  delivery_enabled           boolean,
  tax_rate_bp                integer,
  service_charge_bp          integer,
  default_language           text,
  branding                   jsonb,
  ordering_assistant_enabled boolean
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.slug, r.name_en, r.name_ar,
         s.dine_in_enabled, s.takeout_enabled, s.delivery_enabled,
         s.tax_rate_bp, s.service_charge_bp, s.default_language,
         s.branding, s.ordering_assistant_enabled
  from public.restaurants r
  join public.restaurant_settings s on s.restaurant_id = r.id
  where r.slug = lower(trim(p_slug));
$$;

revoke all on function public.get_public_restaurant(text) from public;
grant execute on function public.get_public_restaurant(text) to anon, authenticated, service_role;
