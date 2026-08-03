INSERT INTO public.event_staff (event_id, user_id, role)
SELECT 'sudoexpo-2026', u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'admin@admin.com.br'
ON CONFLICT DO NOTHING;