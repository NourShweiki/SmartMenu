-- Local demo data (runs on `npx supabase db reset`). Never used in production.
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('11111111-1111-4000-8000-000000000001', 'demo-dinein',  'Demo Grill',  'مشاوي التجربة'),
  ('22222222-2222-4000-8000-000000000002', 'demo-takeout', 'Demo Coffee', 'قهوة التجربة');

insert into public.restaurant_settings (restaurant_id, dine_in_enabled, takeout_enabled, service_charge_bp) values
  ('11111111-1111-4000-8000-000000000001', true,  true, 1000),
  ('22222222-2222-4000-8000-000000000002', false, true, 0);
