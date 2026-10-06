-- Local demo data (runs on `npx supabase db reset`). Never used in production.
insert into public.restaurants (id, slug, name_en, name_ar) values
  ('11111111-1111-4000-8000-000000000001', 'demo-dinein',  'Demo Grill',  'مشاوي التجربة'),
  ('22222222-2222-4000-8000-000000000002', 'demo-takeout', 'Demo Coffee', 'قهوة التجربة');

insert into public.restaurant_settings (restaurant_id, dine_in_enabled, takeout_enabled, service_charge_bp) values
  ('11111111-1111-4000-8000-000000000001', true,  true, 1000),
  ('22222222-2222-4000-8000-000000000002', false, true, 0);

-- ─── Demo staff (email + password sign-in) ──────────────────────────────
-- Local only. Every demo account uses the password: smartmenu-demo-2026
-- GoTrue needs the token columns to be '' (not NULL) and a matching auth.identities row.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('smartmenu-demo-2026', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(),
       '', '', '', ''
from (values
  ('aaaa0001-0000-4000-8000-000000000001'::uuid, 'owner@demo-dinein.test'),
  ('aaaa0001-0000-4000-8000-000000000002'::uuid, 'waiter@demo-dinein.test'),
  ('aaaa0001-0000-4000-8000-000000000003'::uuid, 'cashier@demo-dinein.test'),
  ('bbbb0001-0000-4000-8000-000000000001'::uuid, 'owner@demo-takeout.test')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email like '%@demo-%.test';

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('11111111-1111-4000-8000-000000000001', 'aaaa0001-0000-4000-8000-000000000001', 'OWNER'),
  ('11111111-1111-4000-8000-000000000001', 'aaaa0001-0000-4000-8000-000000000002', 'WAITER'),
  ('11111111-1111-4000-8000-000000000001', 'aaaa0001-0000-4000-8000-000000000003', 'CASHIER'),
  ('22222222-2222-4000-8000-000000000002', 'bbbb0001-0000-4000-8000-000000000001', 'OWNER');

-- ─── Demo menus (prices in fils: 4500 = 4.500 JD) ───────────────────────
insert into public.menu_categories (id, restaurant_id, name_en, name_ar, sort_order) values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'Grills',    'مشاوي',    0),
  ('c1000000-0000-4000-8000-000000000002', '11111111-1111-4000-8000-000000000001', 'Appetizers', 'مقبلات',   1),
  ('c1000000-0000-4000-8000-000000000003', '11111111-1111-4000-8000-000000000001', 'Drinks',    'مشروبات',  2),
  ('c2000000-0000-4000-8000-000000000001', '22222222-2222-4000-8000-000000000002', 'Hot coffee', 'قهوة ساخنة', 0),
  ('c2000000-0000-4000-8000-000000000002', '22222222-2222-4000-8000-000000000002', 'Sweets',    'حلويات',   1);

insert into public.menu_items (restaurant_id, category_id, name_en, name_ar, description_en, description_ar, price_fils, sort_order, is_sold_out) values
  ('11111111-1111-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Mixed grill', 'مشاوي مشكلة',
   'Kebab, shish tawook and lamb tikka with grilled vegetables', 'كباب وشيش طاووق وتكة لحم مع خضار مشوية', 9500, 0, false),
  ('11111111-1111-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Kebab', 'كباب',
   'Minced lamb with parsley and onion', 'لحم غنم مفروم مع بقدونس وبصل', 4500, 1, false),
  ('11111111-1111-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Shish tawook', 'شيش طاووق',
   'Marinated chicken skewers with garlic sauce', 'أسياخ دجاج متبلة مع ثومية', 4000, 2, true),
  ('11111111-1111-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'Hummus', 'حمص',
   '', '', 1250, 0, false),
  ('11111111-1111-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'Moutabal', 'متبل',
   'Smoked eggplant with tahini', 'باذنجان مدخن مع طحينة', 1500, 1, false),
  ('11111111-1111-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003', 'Lemon with mint', 'ليمون ونعنع',
   '', '', 1750, 0, false),
  ('22222222-2222-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Arabic coffee', 'قهوة عربية',
   'With cardamom', 'مع هيل', 1000, 0, false),
  ('22222222-2222-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'Cappuccino', 'كابتشينو',
   '', '', 2250, 1, false),
  ('22222222-2222-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'Knafeh', 'كنافة',
   'Nabulsi cheese knafeh', 'كنافة بالجبنة النابلسية', 2500, 0, false);

-- ─── Demo option groups (reusable; prices are extra fils) ────────────────
insert into public.option_groups (id, restaurant_id, name_en, name_ar, min_select, max_select, sort_order) values
  ('09000000-0000-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'Size',   'الحجم',   1, 1, 0),
  ('09000000-0000-4000-8000-000000000002', '11111111-1111-4000-8000-000000000001', 'Extras', 'إضافات', 0, 3, 1),
  ('09000000-0000-4000-8000-000000000003', '22222222-2222-4000-8000-000000000002', 'Milk',   'الحليب',  0, 1, 0);

insert into public.options (restaurant_id, group_id, name_en, name_ar, price_delta_fils, sort_order) values
  ('11111111-1111-4000-8000-000000000001', '09000000-0000-4000-8000-000000000001', 'Regular',     'عادي',        0,    0),
  ('11111111-1111-4000-8000-000000000001', '09000000-0000-4000-8000-000000000001', 'Large',       'كبير',        2000, 1),
  ('11111111-1111-4000-8000-000000000001', '09000000-0000-4000-8000-000000000002', 'Extra bread', 'خبز إضافي',   250,  0),
  ('11111111-1111-4000-8000-000000000001', '09000000-0000-4000-8000-000000000002', 'Garlic sauce','ثومية',       250,  1),
  ('11111111-1111-4000-8000-000000000001', '09000000-0000-4000-8000-000000000002', 'Pickles',     'مخلل',        0,    2),
  ('22222222-2222-4000-8000-000000000002', '09000000-0000-4000-8000-000000000003', 'Oat milk',    'حليب الشوفان', 500, 0),
  ('22222222-2222-4000-8000-000000000002', '09000000-0000-4000-8000-000000000003', 'Lactose-free','خالي من اللاكتوز', 250, 1);

-- Size + Extras on the grills; Milk on the cappuccino.
insert into public.menu_item_option_groups (restaurant_id, item_id, group_id, sort_order)
select i.restaurant_id, i.id, g.id, g.sort_order
from public.menu_items i
join public.option_groups g on g.restaurant_id = i.restaurant_id
where (i.name_en in ('Mixed grill', 'Kebab') and g.name_en in ('Size', 'Extras'))
   or (i.name_en = 'Cappuccino' and g.name_en = 'Milk');
