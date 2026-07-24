
DROP POLICY IF EXISTS "own or staff can read profile" ON public.profiles;
CREATE POLICY "profiles publicly readable" ON public.profiles FOR SELECT TO anon, authenticated USING (true);

-- Tighten SECURITY DEFINER helpers: only staff should call has_role/is_staff externally
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
