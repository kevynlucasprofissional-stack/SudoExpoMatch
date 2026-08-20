-- IMPL 12 — prova transacional end-to-end das relações complementares editáveis.
DO $proof$
DECLARE
  v_ev     text := 'impl12-proof-event';
  v_ev2    text := 'impl12-proof-event-2';
  v_admin  uuid := gen_random_uuid();
  v_staff  uuid := gen_random_uuid();
  v_user   uuid := gen_random_uuid();
  v_admin2 uuid := gen_random_uuid();
  v_ix     uuid;
  v_iy     uuid;
  v_rel    uuid;
  v_pa     uuid := gen_random_uuid();
  v_pb     uuid := gen_random_uuid();
  v_need   uuid;
  v_offer  uuid;
  v_match  RECORD;
  v_reason RECORD;
  v_txt    text;
  v_n      int;
BEGIN
  INSERT INTO public.events (id, name, city, is_active) VALUES
    (v_ev, 'Prova Impl12', 'Rio Verde', true),
    (v_ev2, 'Prova Impl12 B', 'Rio Verde', true);

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.id::text || '@impl12.proof', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  FROM (VALUES (v_admin), (v_staff), (v_user), (v_admin2)) AS u(id);

  INSERT INTO public.event_staff (event_id, user_id, role) VALUES
    (v_ev, v_admin, 'admin'),
    (v_ev, v_staff, 'staff'),
    (v_ev2, v_admin2, 'admin');

  INSERT INTO public.profiles (id, event_id, name, company, city, whatsapp, segment_id,
                               summary, offers, needs, consent, is_demo, recovery_code)
  VALUES
    (v_pa, v_ev, 'Prova A', 'Empresa A', 'Rio Verde', '', 'servicos',
     'perfil de prova A', '[]'::jsonb, '[]'::jsonb, true, true, 'x'),
    (v_pb, v_ev, 'Prova B', 'Empresa B', 'Montividiu', '', 'servicos',
     'perfil de prova B', '[]'::jsonb, '[]'::jsonb, true, true, 'x');

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);

  v_ix := public.admin_create_taxonomy_item(v_ev, 'Prova Impl12 Divulgacao', 'servicos', 'need', NULL, ARRAY[]::text[]);
  v_iy := public.admin_create_taxonomy_item(v_ev, 'Prova Impl12 Redes Sociais', 'servicos', 'offer', NULL, ARRAY[]::text[]);

  RESET role;

  INSERT INTO public.profile_needs (profile_id, event_id, taxonomy_item_id, text, label,
                                    need_kind, source, sort_order, active)
  VALUES (v_pa, v_ev, v_ix, 'Prova Impl12 Divulgacao', 'Prova Impl12 Divulgacao',
          'servico', 'manual', 0, true)
  RETURNING id INTO v_need;

  INSERT INTO public.profile_offers (profile_id, event_id, taxonomy_item_id, text, label,
                                     source, sort_order, active)
  VALUES (v_pb, v_ev, v_iy, 'Prova Impl12 Redes Sociais', 'Prova Impl12 Redes Sociais',
          'manual', 0, true)
  RETURNING id INTO v_offer;

  PERFORM public._recompute_matches_for_profile(v_pa, v_ev);
  SELECT count(*) INTO v_n FROM public.matches m
   WHERE m.event_id = v_ev AND m.is_active;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FALHA: baseline deveria nao ter match ativo, veio %', v_n;
  END IF;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);

  BEGIN
    PERFORM public.admin_create_taxonomy_relation(v_ev, gen_random_uuid(), v_iy, 'complements', 80, NULL);
    RAISE EXCEPTION 'FALHA: origem inexistente deveria falhar';
  EXCEPTION WHEN sqlstate 'P0002' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'from_item_not_found' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  BEGIN
    PERFORM public.admin_create_taxonomy_relation(v_ev, v_ix, gen_random_uuid(), 'complements', 80, NULL);
    RAISE EXCEPTION 'FALHA: destino inexistente deveria falhar';
  EXCEPTION WHEN sqlstate 'P0002' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'to_item_not_found' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  FOR v_n IN SELECT unnest(ARRAY[0, 101, -3]) LOOP
    BEGIN
      PERFORM public.admin_create_taxonomy_relation(v_ev, v_ix, v_iy, 'complements', v_n, NULL);
      RAISE EXCEPTION 'FALHA: weight % deveria falhar', v_n;
    EXCEPTION WHEN sqlstate 'P0001' THEN
      GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
      IF v_txt <> 'invalid_weight' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
    END;
  END LOOP;

  BEGIN
    PERFORM public.admin_create_taxonomy_relation(v_ev, v_ix, v_iy, 'requires', 80, NULL);
    RAISE EXCEPTION 'FALHA: relation_type invalido deveria falhar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'invalid_relation_type' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  BEGIN
    PERFORM public.admin_create_taxonomy_relation(v_ev, v_ix, v_iy, 'complements', 80, repeat('a', 501));
    RAISE EXCEPTION 'FALHA: rationale acima do limite deveria falhar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'invalid_rationale' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  BEGIN
    PERFORM public.admin_create_taxonomy_relation(v_ev, v_ix, v_ix, 'complements', 80, NULL);
    RAISE EXCEPTION 'FALHA: self relation deveria falhar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'self_relation' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  SELECT count(*) INTO v_n FROM public.taxonomy_relations
   WHERE from_taxonomy_item_id IN (v_ix, v_iy) OR to_taxonomy_item_id IN (v_ix, v_iy);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: negativos persistiram % relacao(oes)', v_n; END IF;

  v_rel := (public.admin_create_taxonomy_relation(
              v_ev, v_ix, v_iy, 'complements', 80,
              'Quem precisa divulgar o negocio se beneficia de gestao de redes sociais.')
            ->>'id')::uuid;

  BEGIN
    PERFORM public.admin_create_taxonomy_relation(v_ev, v_ix, v_iy, 'complements', 60, NULL);
    RAISE EXCEPTION 'FALHA: duplicata deveria falhar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'duplicate_relation' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_staff, 'role', 'authenticated')::text);
  BEGIN
    PERFORM public.admin_update_taxonomy_relation(v_ev, v_rel, 'complements', 90, NULL);
    RAISE EXCEPTION 'FALHA: staff nao deveria mutar relacao';
  EXCEPTION WHEN sqlstate '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_set_taxonomy_relation_active(v_ev, v_rel, false);
    RAISE EXCEPTION 'FALHA: staff nao deveria desativar relacao';
  EXCEPTION WHEN sqlstate '42501' THEN NULL;
  END;

  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_user, 'role', 'authenticated')::text);
  BEGIN
    PERFORM public.admin_create_taxonomy_relation(v_ev, v_iy, v_ix, 'complements', 80, NULL);
    RAISE EXCEPTION 'FALHA: usuario comum nao deveria criar relacao';
  EXCEPTION WHEN sqlstate '42501' THEN NULL;
  END;

  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin2, 'role', 'authenticated')::text);
  BEGIN
    PERFORM public.admin_update_taxonomy_relation(v_ev, v_rel, 'complements', 90, NULL);
    RAISE EXCEPTION 'FALHA: admin de outro evento nao deveria mutar';
  EXCEPTION WHEN sqlstate '42501' THEN NULL;
  END;

  BEGIN
    UPDATE public.taxonomy_relations SET weight = 100 WHERE id = v_rel;
    IF FOUND THEN RAISE EXCEPTION 'FALHA: update direto na tabela nao deveria afetar linhas'; END IF;
  EXCEPTION WHEN sqlstate '42501' THEN NULL;
  END;

  RESET role;
  SELECT weight INTO v_n FROM public.taxonomy_relations WHERE id = v_rel;
  IF v_n <> 80 THEN RAISE EXCEPTION 'FALHA: peso alterado indevidamente (%)', v_n; END IF;

  PERFORM public._recompute_matches_for_profile(v_pa, v_ev);

  SELECT * INTO v_match FROM public.matches m
   WHERE m.event_id = v_ev AND m.is_active;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'FALHA: match complementar deveria existir apos criar a relacao';
  END IF;
  IF v_match.kind <> 'complementar' THEN
    RAISE EXCEPTION 'FALHA: kind esperado complementar, veio %', v_match.kind;
  END IF;

  SELECT * INTO v_reason FROM public.match_reasons r
   WHERE r.match_id = v_match.id AND r.perspective_profile_id = v_pa
     AND r.code = 'relacao_complementar';
  IF v_reason.id IS NULL THEN RAISE EXCEPTION 'FALHA: match_reason complementar ausente para A'; END IF;
  IF v_reason.profile_need_id <> v_need THEN RAISE EXCEPTION 'FALHA: need_id incorreto'; END IF;
  IF v_reason.profile_offer_id <> v_offer THEN RAISE EXCEPTION 'FALHA: offer_id incorreto'; END IF;
  IF v_reason.taxonomy_relation_id <> v_rel THEN RAISE EXCEPTION 'FALHA: relation_id incorreto'; END IF;
  IF v_reason.relation_weight <> 80 THEN RAISE EXCEPTION 'FALHA: relation_weight incorreto (%)', v_reason.relation_weight; END IF;
  IF v_reason.rationale NOT LIKE 'Quem precisa divulgar%' THEN RAISE EXCEPTION 'FALHA: rationale nao propagado'; END IF;
  IF v_reason.weight <> 24 THEN RAISE EXCEPTION 'FALHA: contribuicao esperada 24, veio %', v_reason.weight; END IF;

  SELECT count(*) INTO v_n FROM public.match_reasons r
   WHERE r.match_id = v_match.id AND r.perspective_profile_id = v_pb
     AND r.code = 'relacao_complementar';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: relacao inversa foi inferida automaticamente'; END IF;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);
  PERFORM public.admin_update_taxonomy_relation(v_ev, v_rel, 'complements', 30, NULL);
  RESET role;

  PERFORM public._recompute_matches_for_profile(v_pa, v_ev);
  SELECT count(*) INTO v_n FROM public.matches m WHERE m.id = v_match.id AND m.is_active;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: peso 30 (abaixo do piso 40) nao deveria manter o match'; END IF;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);
  PERFORM public.admin_update_taxonomy_relation(v_ev, v_rel, 'complements', 50, 'peso medio');
  RESET role;

  PERFORM public._recompute_matches_for_profile(v_pa, v_ev);
  SELECT r.weight AS w, r.relation_weight AS rw INTO v_reason
    FROM public.match_reasons r
   WHERE r.match_id = v_match.id AND r.perspective_profile_id = v_pa
     AND r.code = 'relacao_complementar';
  IF v_reason.rw <> 50 OR v_reason.w <> 15 THEN
    RAISE EXCEPTION 'FALHA: peso 50 deveria contribuir 15 pontos, veio % (relation_weight %)',
      v_reason.w, v_reason.rw;
  END IF;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);
  PERFORM public.admin_update_taxonomy_relation(v_ev, v_rel, 'complements', 100, 'peso maximo');
  RESET role;
  PERFORM public._recompute_matches_for_profile(v_pa, v_ev);
  SELECT r.weight INTO v_n FROM public.match_reasons r
   WHERE r.match_id = v_match.id AND r.perspective_profile_id = v_pa
     AND r.code = 'relacao_complementar';
  IF v_n <> 30 THEN RAISE EXCEPTION 'FALHA: teto de 30 pontos nao respeitado (%)', v_n; END IF;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);
  PERFORM public.admin_set_taxonomy_relation_active(v_ev, v_rel, false);
  RESET role;

  PERFORM public._recompute_matches_for_profile(v_pa, v_ev);
  SELECT count(*) INTO v_n FROM public.matches m WHERE m.id = v_match.id AND m.is_active;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: relacao desativada deveria remover o match complementar'; END IF;
  -- O historico de motivos do match desativado e preservado por design;
  -- o que precisa desaparecer e o sinal complementar em matches ATIVOS.
  SELECT count(*) INTO v_n FROM public.match_reasons r
    JOIN public.matches m ON m.id = r.match_id AND m.is_active
   WHERE m.event_id = v_ev AND r.code = 'relacao_complementar';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: sinal complementar ativo deveria desaparecer'; END IF;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);
  PERFORM public.admin_set_taxonomy_relation_active(v_ev, v_rel, true);
  RESET role;
  PERFORM public._recompute_matches_for_profile(v_pa, v_ev);
  SELECT count(*) INTO v_n FROM public.matches m WHERE m.id = v_match.id AND m.is_active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: reativacao deveria restaurar o match'; END IF;

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE event_id = v_ev AND target_table = 'taxonomy_relation' AND target_id = v_rel::text;
  IF v_n <> 6 THEN RAISE EXCEPTION 'FALHA: esperados 6 audit_logs da relacao, vieram %', v_n; END IF;

  RAISE NOTICE 'IMPL12 E2E OK — relacao % controla o Matcher v2.3 de ponta a ponta', v_rel;

  DELETE FROM public.match_reasons WHERE match_id IN (SELECT id FROM public.matches WHERE event_id = v_ev);
  DELETE FROM public.matches WHERE event_id = v_ev;
  DELETE FROM public.profile_needs WHERE event_id = v_ev;
  DELETE FROM public.profile_offers WHERE event_id = v_ev;
  DELETE FROM public.profiles WHERE event_id = v_ev;
  DELETE FROM public.taxonomy_relations WHERE from_taxonomy_item_id IN (v_ix, v_iy) OR to_taxonomy_item_id IN (v_ix, v_iy);
  DELETE FROM public.taxonomy_items WHERE id IN (v_ix, v_iy);
  DELETE FROM public.audit_logs WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.event_staff WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM auth.users WHERE id IN (v_admin, v_staff, v_user, v_admin2);
  DELETE FROM public.events WHERE id IN (v_ev, v_ev2);
END $proof$;