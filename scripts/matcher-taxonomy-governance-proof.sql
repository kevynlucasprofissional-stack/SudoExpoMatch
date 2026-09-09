-- Prova transacional — governança de snapshots do matcher v2.4.
-- Requer migrations aplicadas até 20260909194000_matcher_taxonomy_governance.sql.
-- Não deixa fixtures nem incrementa a revisão real: tudo termina em ROLLBACK.

BEGIN;

DO $proof$
DECLARE
  v_event text := 'matcher-governance-proof-event';
  v_admin uuid := gen_random_uuid();
  v_item uuid;
  v_before jsonb;
  v_clean jsonb;
  v_dirty jsonb;
  v_after jsonb;
  v_rev_before bigint;
BEGIN
  INSERT INTO public.events(id, name, city, is_active)
  VALUES (v_event, 'Prova governança matcher', 'Rio Verde', true);

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    v_admin, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', v_admin::text || '@matcher-governance.proof', '',
    now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  );

  INSERT INTO public.event_staff(event_id, user_id, role)
  VALUES (v_event, v_admin, 'admin');

  SELECT taxonomy_revision INTO v_rev_before
    FROM public.matcher_config_state WHERE singleton = true;

  SET LOCAL role authenticated;
  EXECUTE format(
    'SET LOCAL request.jwt.claims = %L',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text
  );

  -- Evento sem rebuild deve iniciar dirty diante da revisão global já existente.
  v_before := public.admin_get_matcher_taxonomy_status(v_event);
  IF COALESCE((v_before->>'dirty')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA: evento novo deveria iniciar dirty: %', v_before;
  END IF;

  -- Rebuild aplica a revisão atual e limpa o estado.
  PERFORM public.admin_recompute_event_matches(v_event);
  v_clean := public.admin_get_matcher_taxonomy_status(v_event);
  IF COALESCE((v_clean->>'dirty')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHA: rebuild deveria deixar evento clean: %', v_clean;
  END IF;
  IF (v_clean->>'applied_taxonomy_revision')::bigint <> (v_clean->>'taxonomy_revision')::bigint THEN
    RAISE EXCEPTION 'FALHA: revisão aplicada difere da atual: %', v_clean;
  END IF;

  -- Qualquer mutação semântica da taxonomia incrementa a revisão global.
  v_item := public.admin_create_taxonomy_item(
    v_event,
    'Prova Governança Matcher Item',
    'servicos',
    'both',
    'Item efêmero usado somente pela prova transacional.',
    ARRAY['prova governanca matcher']::text[]
  );

  v_dirty := public.admin_get_matcher_taxonomy_status(v_event);
  IF COALESCE((v_dirty->>'dirty')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA: mutação da taxonomia deveria marcar evento dirty: %', v_dirty;
  END IF;
  IF (v_dirty->>'taxonomy_revision')::bigint <= (v_clean->>'taxonomy_revision')::bigint THEN
    RAISE EXCEPTION 'FALHA: revisão não avançou após mutação: antes %, depois %', v_clean, v_dirty;
  END IF;

  -- Novo rebuild aplica a revisão nova.
  PERFORM public.admin_recompute_event_matches(v_event);
  v_after := public.admin_get_matcher_taxonomy_status(v_event);
  IF COALESCE((v_after->>'dirty')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHA: segundo rebuild deveria limpar dirty: %', v_after;
  END IF;
  IF (v_after->>'applied_taxonomy_revision')::bigint <> (v_after->>'taxonomy_revision')::bigint THEN
    RAISE EXCEPTION 'FALHA: segunda revisão não foi aplicada: %', v_after;
  END IF;

  -- A prova também deve enxergar o uso de sinônimo no diagnóstico.
  IF (v_after->>'items_with_synonyms')::int < 1 THEN
    RAISE EXCEPTION 'FALHA: diagnóstico não contabilizou item com sinônimo: %', v_after;
  END IF;

  RESET role;

  RAISE NOTICE 'OK matcher-governance: revisão inicial %, clean %, dirty %, final %',
    v_rev_before,
    v_clean->>'taxonomy_revision',
    v_dirty->>'taxonomy_revision',
    v_after->>'taxonomy_revision';
END;
$proof$;

ROLLBACK;
