DO $$
DECLARE
  v_admin uuid;
  v_other uuid;
  v_match uuid;
  v_total int;
  v_res jsonb;
  v_ok boolean;
BEGIN
  SELECT user_id INTO v_admin FROM public.event_staff WHERE event_id='sudoexpo-2026' AND role='admin' LIMIT 1;
  SELECT id INTO v_match FROM public.matches WHERE event_id='sudoexpo-2026' LIMIT 1;
  SELECT id INTO v_other FROM auth.users WHERE id <> v_admin AND id NOT IN (SELECT user_id FROM public.event_staff) LIMIT 1;
  IF v_admin IS NULL OR v_match IS NULL THEN
    RAISE NOTICE 'fixtures ausentes, prova ignorada'; RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);

  -- marcar
  v_res := public.admin_set_match_reviewed('sudoexpo-2026', v_match, true);
  IF (v_res->>'reviewed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'marcar falhou'; END IF;
  SELECT count(*) INTO v_total FROM public.match_admin_reviews WHERE match_id=v_match AND reviewed AND reviewed_by=v_admin;
  IF v_total <> 1 THEN RAISE EXCEPTION 'linha de revisao ausente'; END IF;

  -- listagem reflete revisao
  SELECT (i->>'reviewed')::boolean INTO v_ok
    FROM jsonb_array_elements(public.admin_list_matches('sudoexpo-2026') -> 'items') i
   WHERE i->>'id' = v_match::text;
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'listagem nao reflete revisao'; END IF;

  -- filtros
  IF (public.admin_list_matches('sudoexpo-2026', _reviewed => true) ->> 'total')::int <> 1 THEN
    RAISE EXCEPTION 'filtro revisados incorreto'; END IF;
  IF (public.admin_list_matches('sudoexpo-2026', _reviewed => false) ->> 'total')::int
     <> (public.admin_list_matches('sudoexpo-2026') ->> 'total')::int - 1 THEN
    RAISE EXCEPTION 'filtro nao revisados incorreto'; END IF;

  -- auditoria
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE target_id=v_match::text AND action='match_review_set') THEN
    RAISE EXCEPTION 'audit_logs nao registrou marcacao'; END IF;

  -- desmarcar limpa autoria
  v_res := public.admin_set_match_reviewed('sudoexpo-2026', v_match, false);
  IF (v_res->>'reviewed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'desmarcar falhou'; END IF;
  IF EXISTS (SELECT 1 FROM public.match_admin_reviews WHERE match_id=v_match AND (reviewed OR reviewed_by IS NOT NULL OR reviewed_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'desmarcar nao limpou autoria'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE target_id=v_match::text AND action='match_review_cleared') THEN
    RAISE EXCEPTION 'audit_logs nao registrou desmarcacao'; END IF;

  -- match inexistente
  BEGIN
    PERFORM public.admin_set_match_reviewed('sudoexpo-2026', '00000000-0000-4000-8000-000000000000'::uuid, true);
    RAISE EXCEPTION 'match inexistente deveria falhar';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT ILIKE '%not_found%' THEN RAISE EXCEPTION 'erro inesperado: %', SQLERRM; END IF;
  END;

  -- nao-admin bloqueado
  IF v_other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role','authenticated')::text, true);
    BEGIN
      PERFORM public.admin_set_match_reviewed('sudoexpo-2026', v_match, true);
      RAISE EXCEPTION 'nao-admin deveria ser bloqueado';
    EXCEPTION WHEN others THEN
      IF SQLERRM NOT ILIKE '%forbidden%' THEN RAISE EXCEPTION 'erro inesperado: %', SQLERRM; END IF;
    END;
  END IF;

  -- limpeza: nada de estado de teste persistido
  DELETE FROM public.match_admin_reviews WHERE match_id = v_match;
  DELETE FROM public.audit_logs WHERE target_id = v_match::text AND action IN ('match_review_set','match_review_cleared');
  RAISE NOTICE 'IMPL15: prova comportamental de revisao de matches OK';
END $$;