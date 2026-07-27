-- =========================================================
-- FASE SEG-2: Hardening de EXECUTE em funções SECURITY DEFINER
-- e remoção de funções legadas.
-- =========================================================

-- 1) Remover funções legadas não referenciadas pelo frontend.
DROP FUNCTION IF EXISTS public.record_match_decision(uuid, public.decision);
DROP FUNCTION IF EXISTS public.recover_profile(text, text, text);
DROP FUNCTION IF EXISTS public.upsert_own_profile(text, text, text, text, text, text, text, boolean, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.admin_remove_event_staff(text, uuid);
DROP FUNCTION IF EXISTS public.list_event_profile_cards(text);
DROP FUNCTION IF EXISTS public.segment_distribution(text);
DROP FUNCTION IF EXISTS public.store_computed_matches(jsonb);

-- 2) Helper: revogar EXECUTE de PUBLIC + anon em uma função.
--    Aplicado a toda função SECURITY DEFINER de negócio.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 3) Allowlist explícita de EXECUTE para authenticated.
--    Participante (perfil, recuperação, matches, contato):
GRANT EXECUTE ON FUNCTION public.get_own_profile_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_own_profile_v2(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_own_contact(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_own_recovery_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_profile_v2(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_own_matches_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_match_decision_v2(uuid, public.decision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_own_matches(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_contact_for_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_segments_and_taxonomy(text) TO authenticated;

-- Staff/Admin (fila operacional, notas, atribuições, revelação com override):
GRANT EXECUTE ON FUNCTION public.event_operational_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_connections_v2(text, public.connection_status[], text[], text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_connection_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_assume_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_release_connection(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_advance_connection(uuid, public.connection_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_add_connection_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reveal_contact_for_match(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_event_staff(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_event_staff_by_email(text, text, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_event_staff_role(text, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_event_staff(text, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reassign_connection(uuid, uuid, text) TO authenticated;

-- Agregado público (painel /publico): sem PII, apenas contagens.
GRANT EXECUTE ON FUNCTION public.event_stats(text) TO anon, authenticated;

-- Helpers de RLS: precisam ser executáveis pelo papel que dispara a policy.
--    Sessões anônimas do Supabase (signInAnonymously) usam o papel SQL
--    "authenticated" com claim is_anonymous=true, então não é necessário
--    conceder EXECUTE ao papel SQL anon.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_event_role(text, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_event_role(text, uuid) TO authenticated;

-- 4) Utilitários IMMUTABLE/STABLE que participam de matching/normalização.
--    Não expor ao anon SQL. Manter authenticated para uso em queries próprias.
REVOKE ALL ON FUNCTION public.taxonomy_match(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.norm_label(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.slugify(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalize_phone(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hash_phone(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hash_recovery_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_recovery_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.taxonomy_match(uuid, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.norm_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.slugify(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hash_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hash_recovery_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_recovery_code(text, text) TO service_role;

-- 5) Trigger functions: não devem ser invocáveis por clientes.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_create_connection() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_events_set_actor() FROM PUBLIC, anon, authenticated;

-- 6) Reforço: internas de recomputação só via service_role.
REVOKE ALL ON FUNCTION public._recompute_matches_for_profile(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_matches_for_profile_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._recompute_matches_for_profile(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_matches_for_profile_id(uuid) TO service_role;
