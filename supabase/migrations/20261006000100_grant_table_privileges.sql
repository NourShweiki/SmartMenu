-- Newer Supabase projects don't auto-grant table privileges to API roles.
-- Grant only what the RLS policies are written for; RLS still decides which ROWS.
-- anon gets nothing (public menu will use a dedicated read path later).

grant select, update                 on public.restaurants         to authenticated;
grant select, update                 on public.restaurant_settings to authenticated;
grant select, insert, update, delete on public.restaurant_members  to authenticated;

-- Server-side code (founders' setup tool, background jobs) uses service_role, which bypasses RLS.
grant all on public.restaurants, public.restaurant_settings, public.restaurant_members to service_role;
