REVOKE EXECUTE ON FUNCTION public.get_own_social_profile(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_own_social_profile(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_get_participant_social(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_participant_social(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._normalize_social_handle(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._social_cache_json(private.social_profile_cache, boolean) FROM PUBLIC, anon, authenticated;