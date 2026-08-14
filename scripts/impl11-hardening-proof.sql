-- IMPL 11 (hardening) — prova transacional completa.
-- Executada como uma única instrução: qualquer falha desfaz tudo
-- automaticamente; em caso de sucesso a limpeza explícita no fim remove
-- todas as fixtures.
DO $proof$
DECLARE
  v_ev    text := 'impl11-proof-event';
  v_ev2   text := 'impl11-proof-event-2';
  v_admin uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_admin2 uuid := gen_random_uuid();
  v_item  uuid;
  v_item2 uuid;
  v_rel   uuid;
  v_pa    uuid := gen_random_uuid();
  v_pb    uuid := gen_random_uuid();
  v_off   uuid;
  v_need  uuid;
  v_match uuid := gen_random_uuid();
  v_reason uuid;
  v_json  jsonb;
  v_n     int;
  v_txt   text;
  v_syn   text[];
BEGIN
  ---------------------------------------------------------------------------
  -- Fixtures
  ---------------------------------------------------------------------------
  INSERT INTO public.events (id, name, city, is_active) VALUES
    (v_ev, 'Prova Impl11', 'Rio Verde', true),
    (v_ev2, 'Prova Impl11 B', 'Rio Verde', true);

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.id::text || '@impl11.proof', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  FROM (VALUES (v_admin), (v_staff), (v_admin2)) AS u(id);

  INSERT INTO public.event_staff (event_id, user_id, role) VALUES
    (v_ev, v_admin, 'admin'),
    (v_ev, v_staff, 'staff'),
    (v_ev2, v_admin2, 'admin');

  ---------------------------------------------------------------------------
  -- 1. Sessão admin: criação do item
  ---------------------------------------------------------------------------
  EXECUTE format('SET LOCAL role authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);

  v_item := public.admin_create_taxonomy_item(v_ev, 'Prova Consultoria XYZ', 'servicos', 'both',
                                              'item de prova', ARRAY['  PDV ', 'pdv', 'Ponto de venda']);
  v_item2 := public.admin_create_taxonomy_item(v_ev, 'Prova Software XYZ', 'servicos', 'offer',
                                               NULL, ARRAY[]::text[]);
  SELECT synonyms INTO v_syn FROM public.taxonomy_items WHERE id = v_item;
  IF v_syn <> ARRAY['PDV','Ponto de venda'] THEN
    RAISE EXCEPTION 'FALHA: dedupe de sinônimos inesperado: %', v_syn;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Limites de sinônimos: erros tratáveis, não truncamento silencioso
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.admin_create_taxonomy_item(
      v_ev, 'Prova 21 sinonimos', 'servicos', 'both', NULL,
      (SELECT array_agg('syn' || g) FROM generate_series(1, 21) g));
    RAISE EXCEPTION 'FALHA: 21 sinônimos distintos deveria falhar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'too_many_synonyms' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  BEGIN
    PERFORM public.admin_create_taxonomy_item(
      v_ev, 'Prova sinonimo longo', 'servicos', 'both', NULL, ARRAY[repeat('a', 81)]);
    RAISE EXCEPTION 'FALHA: sinônimo de 81 chars deveria falhar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'synonym_too_long' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  BEGIN
    PERFORM public.admin_create_taxonomy_item(
      v_ev, 'Prova payload gigante', 'servicos', 'both', NULL,
      (SELECT array_agg('s' || g) FROM generate_series(1, 101) g));
    RAISE EXCEPTION 'FALHA: payload bruto acima de 100 deveria falhar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'too_many_synonyms_raw' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  -- Vazios/duplicatas que normalizam para <= 20 são ACEITOS.
  PERFORM public.admin_update_taxonomy_item(
    v_ev, v_item, 'Prova Consultoria XYZ', 'servicos', 'both', 'item de prova',
    ARRAY['pdv', ' PDV ', '', '   ', 'Ponto de venda', 'ponto de venda', 'caixa']);
  SELECT synonyms INTO v_syn FROM public.taxonomy_items WHERE id = v_item;
  IF array_length(v_syn, 1) <> 3 THEN
    RAISE EXCEPTION 'FALHA: normalização deveria resultar em 3 sinônimos, veio %', v_syn;
  END IF;

  -- Update com 21 sinônimos também é bloqueado ANTES de persistir.
  BEGIN
    PERFORM public.admin_update_taxonomy_item(
      v_ev, v_item, 'Prova Consultoria XYZ', 'servicos', 'both', NULL,
      (SELECT array_agg('u' || g) FROM generate_series(1, 21) g));
    RAISE EXCEPTION 'FALHA: update com 21 sinônimos deveria falhar';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;
  SELECT synonyms INTO v_syn FROM public.taxonomy_items WHERE id = v_item;
  IF array_length(v_syn, 1) <> 3 THEN
    RAISE EXCEPTION 'FALHA: update inválido não deveria persistir nada';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Toggle em item inexistente => not_found
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.admin_set_taxonomy_item_active(v_ev, gen_random_uuid(), false);
    RAISE EXCEPTION 'FALHA: toggle em item inexistente deveria falhar';
  EXCEPTION WHEN sqlstate 'P0002' THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    IF v_txt <> 'not_found' THEN RAISE EXCEPTION 'FALHA: erro inesperado %', v_txt; END IF;
  END;

  ---------------------------------------------------------------------------
  -- 4. Referências históricas reais apontando para o item
  ---------------------------------------------------------------------------
  RESET role;
  INSERT INTO public.profiles (id, event_id, name, company, city, whatsapp, segment_id,
                               summary, consent, recovery_code)
  VALUES (v_pa, v_ev, 'Perfil A', 'Empresa A', 'Rio Verde', '+5564900000001', 'servicos', 'a', true, 'x'),
         (v_pb, v_ev, 'Perfil B', 'Empresa B', 'Rio Verde', '+5564900000002', 'servicos', 'b', true, 'y');

  INSERT INTO public.profile_offers (profile_id, event_id, segment_id, text, label,
                                     taxonomy_item_id, sort_order)
  VALUES (v_pa, v_ev, 'servicos', 'Prova Consultoria XYZ', 'Prova Consultoria XYZ', v_item, 0)
  RETURNING id INTO v_off;

  INSERT INTO public.profile_needs (profile_id, event_id, segment_id, text, label,
                                    taxonomy_item_id, sort_order)
  VALUES (v_pb, v_ev, 'servicos', 'Prova Consultoria XYZ', 'Prova Consultoria XYZ', v_item, 0)
  RETURNING id INTO v_need;

  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id, to_taxonomy_item_id,
                                         relation_type, weight, rationale, active)
  VALUES (v_item, v_item2, 'complementa', 40, 'prova histórica', true)
  RETURNING id INTO v_rel;

  INSERT INTO public.matches (id, event_id, a_profile_id, b_profile_id, kind,
                              score_for_a, score_for_b, label)
  VALUES (v_match, v_ev, v_pa, v_pb, 'direto', 80, 70, 'alta_compatibilidade');

  INSERT INTO public.match_reasons (match_id, perspective_profile_id, code, label, weight,
                                    profile_need_id, profile_offer_id, taxonomy_relation_id,
                                    rationale, relation_weight)
  VALUES (v_match, v_pb, 'complementar', 'Prova Consultoria XYZ', 40,
          v_need, v_off, v_rel, 'prova histórica congelada', 40)
  RETURNING id INTO v_reason;

  ---------------------------------------------------------------------------
  -- 5. Desativação: catálogo perde o item, histórico permanece intacto
  ---------------------------------------------------------------------------
  EXECUTE format('SET LOCAL role authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);

  v_json := public.list_event_segments_and_taxonomy(v_ev);
  IF NOT (v_json -> 'taxonomy') @> jsonb_build_array(jsonb_build_object('id', v_item)) THEN
    RAISE EXCEPTION 'FALHA: item ativo deveria estar no catálogo';
  END IF;

  PERFORM public.admin_set_taxonomy_item_active(v_ev, v_item, false);

  v_json := public.list_event_segments_and_taxonomy(v_ev);
  IF (v_json -> 'taxonomy') @> jsonb_build_array(jsonb_build_object('id', v_item)) THEN
    RAISE EXCEPTION 'FALHA: item inativo NÃO deveria aparecer no catálogo';
  END IF;

  RESET role;
  SELECT count(*) INTO v_n FROM public.profile_offers WHERE id = v_off AND taxonomy_item_id = v_item;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: profile_offer histórico perdido'; END IF;
  SELECT count(*) INTO v_n FROM public.profile_needs WHERE id = v_need AND taxonomy_item_id = v_item;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: profile_need histórico perdido'; END IF;
  SELECT count(*) INTO v_n FROM public.taxonomy_relations WHERE id = v_rel AND from_taxonomy_item_id = v_item;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: relation histórica perdida'; END IF;
  SELECT count(*) INTO v_n FROM public.match_reasons WHERE id = v_reason AND taxonomy_relation_id = v_rel
                                                       AND profile_need_id = v_need AND profile_offer_id = v_off;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: match_reason histórico perdido'; END IF;
  SELECT count(*) INTO v_n FROM public.taxonomy_items WHERE id = v_item;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: item nunca deve ser apagado'; END IF;

  -- Reativação devolve o item ao catálogo.
  EXECUTE format('SET LOCAL role authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);
  PERFORM public.admin_set_taxonomy_item_active(v_ev, v_item, true);
  v_json := public.list_event_segments_and_taxonomy(v_ev);
  IF NOT (v_json -> 'taxonomy') @> jsonb_build_array(jsonb_build_object('id', v_item)) THEN
    RAISE EXCEPTION 'FALHA: item reativado deveria voltar ao catálogo';
  END IF;

  -- Auditoria das duas operações.
  RESET role;
  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE target_table = 'taxonomy_item' AND target_id = v_item::text
     AND action IN ('deactivate', 'activate');
  IF v_n <> 2 THEN RAISE EXCEPTION 'FALHA: auditoria de ativação/desativação ausente (%).', v_n; END IF;

  ---------------------------------------------------------------------------
  -- 6. Staff real do evento é negado em TODAS as RPCs admin
  ---------------------------------------------------------------------------
  EXECUTE format('SET LOCAL role authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_staff, 'role', 'authenticated')::text);

  BEGIN PERFORM public.admin_list_taxonomy_items(v_ev, NULL, NULL, NULL, NULL, 20, 0);
    RAISE EXCEPTION 'FALHA: staff não pode listar';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM public.admin_get_taxonomy_item_detail(v_ev, v_item);
    RAISE EXCEPTION 'FALHA: staff não pode ver detalhe';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM public.admin_create_taxonomy_item(v_ev, 'Staff nao pode', 'servicos', 'both', NULL, ARRAY[]::text[]);
    RAISE EXCEPTION 'FALHA: staff não pode criar';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM public.admin_update_taxonomy_item(v_ev, v_item, 'Staff nao pode', 'servicos', 'both', NULL, ARRAY[]::text[]);
    RAISE EXCEPTION 'FALHA: staff não pode editar';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM public.admin_set_taxonomy_item_active(v_ev, v_item, false);
    RAISE EXCEPTION 'FALHA: staff não pode desativar';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  -- Mutação direta na tabela também é negada para staff.
  BEGIN
    UPDATE public.taxonomy_items SET label = 'hack' WHERE id = v_item;
    IF FOUND THEN RAISE EXCEPTION 'FALHA: staff conseguiu mutar taxonomy_items diretamente'; END IF;
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  ---------------------------------------------------------------------------
  -- 7. Admin de OUTRO evento continua negado
  ---------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin2, 'role', 'authenticated')::text);
  BEGIN PERFORM public.admin_set_taxonomy_item_active(v_ev, v_item, false);
    RAISE EXCEPTION 'FALHA: admin de outro evento não pode desativar';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM public.admin_list_taxonomy_items(v_ev, NULL, NULL, NULL, NULL, 20, 0);
    RAISE EXCEPTION 'FALHA: admin de outro evento não pode listar';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  RESET role;

  ---------------------------------------------------------------------------
  -- 8. Cleanup completo (sem resíduos)
  ---------------------------------------------------------------------------
  DELETE FROM public.match_reasons WHERE match_id = v_match;
  DELETE FROM public.connection_notes WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.connection_events WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.connection_status_history WHERE connection_id IN
    (SELECT id FROM public.connections WHERE event_id IN (v_ev, v_ev2));
  DELETE FROM public.connections WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.match_decisions WHERE match_id IN
    (SELECT id FROM public.matches WHERE event_id IN (v_ev, v_ev2));
  DELETE FROM public.match_status_history WHERE match_id IN
    (SELECT id FROM public.matches WHERE event_id IN (v_ev, v_ev2));
  DELETE FROM public.match_reasons WHERE match_id IN
    (SELECT id FROM public.matches WHERE event_id IN (v_ev, v_ev2));
  DELETE FROM public.matches WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.profile_offers WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.profile_needs WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.profile_segments WHERE profile_id IN (v_pa, v_pb);
  DELETE FROM public.consents WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.analytics_events WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.ai_runs WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.profiles WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.taxonomy_relations WHERE from_taxonomy_item_id IN (v_item, v_item2)
     OR to_taxonomy_item_id IN (v_item, v_item2);
  DELETE FROM public.audit_logs WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.taxonomy_items WHERE id IN (v_item, v_item2);
  DELETE FROM public.event_staff WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM auth.users WHERE id IN (v_admin, v_staff, v_admin2);
  DELETE FROM public.events WHERE id IN (v_ev, v_ev2);

  -- Verificação final de resíduo.
  IF EXISTS (SELECT 1 FROM public.taxonomy_items WHERE label LIKE 'Prova %XYZ')
     OR EXISTS (SELECT 1 FROM public.events WHERE id IN (v_ev, v_ev2)) THEN
    RAISE EXCEPTION 'FALHA: resíduo da prova no banco';
  END IF;

  RAISE NOTICE 'PROVA IMPL11 HARDENING: OK';
END
$proof$;
