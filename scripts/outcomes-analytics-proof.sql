-- Prova transacional: outcomes comerciais (connection_events) + analytics do funil.
-- Cobre: eventos válidos, evento inválido, actor spoofing, event_id incorreto,
-- ausência de PII, duplicate/retry, outcomes, autorização e agregação admin.
-- Autolimpante: em caso de erro tudo é desfeito; em caso de sucesso as fixtures
-- são removidas explicitamente no fim.
DO $proof$
DECLARE
  v_ev      text := 'outcomes-proof-event';
  v_ev2     text := 'outcomes-proof-event-2';
  v_admin   uuid := gen_random_uuid();
  v_staff   uuid := gen_random_uuid();
  v_out     uuid := gen_random_uuid();  -- staff de OUTRO evento
  v_visitor uuid := gen_random_uuid();
  v_pa      uuid := gen_random_uuid();
  v_pb      uuid := gen_random_uuid();
  v_match   uuid := gen_random_uuid();
  v_conn    uuid := gen_random_uuid();
  v_json    jsonb;
  v_n       int;
  v_ok      boolean;
BEGIN
  ---------------------------------------------------------------------------
  -- Fixtures
  ---------------------------------------------------------------------------
  INSERT INTO public.events (id, name, city, is_active) VALUES
    (v_ev,  'Prova Outcomes', 'Rio Verde', true),
    (v_ev2, 'Prova Outcomes B', 'Rio Verde', true);

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.id::text || '@outcomes.proof', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  FROM (VALUES (v_admin), (v_staff), (v_out), (v_visitor)) AS u(id);

  INSERT INTO public.event_staff (event_id, user_id, role) VALUES
    (v_ev, v_admin, 'admin'),
    (v_ev, v_staff, 'staff'),
    (v_ev2, v_out, 'admin');

  INSERT INTO public.profiles (id, event_id, owner_id, name, company, city,
                               segment_id, summary, is_demo)
  VALUES
    (v_pa, v_ev, v_visitor, 'Prova A', 'Empresa A', 'Rio Verde', 'servicos',
     'perfil A', true),
    (v_pb, v_ev, NULL, 'Prova B', 'Empresa B', 'Rio Verde', 'servicos',
     'perfil B', true);

  INSERT INTO public.matches (id, event_id, a_profile_id, b_profile_id, kind,
                              score_for_a, score_for_b, label, algorithm_version)
  VALUES (v_match, v_ev, v_pa, v_pb, 'direto', 80, 70, 'alta_compatibilidade', 'proof');

  INSERT INTO public.match_decisions (match_id, profile_id, decision) VALUES
    (v_match, v_pa, 'interesse'),
    (v_match, v_pb, 'interesse');

  INSERT INTO public.connections (id, match_id, event_id, a_profile_id, b_profile_id, status,
                                  presented_at)
  VALUES (v_conn, v_match, v_ev, v_pa, v_pb, 'apresentados', now());

  ---------------------------------------------------------------------------
  -- 1. OUTCOMES: staff registra resultado comercial
  ---------------------------------------------------------------------------
  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_staff, 'role', 'authenticated')::text);

  v_json := public.staff_record_connection_outcome(v_conn, 'conversa_realizada', '  conversou no estande  ');
  IF (v_json->>'created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA: outcome deveria ser criado';
  END IF;
  IF jsonb_array_length(v_json->'outcomes') <> 1 THEN
    RAISE EXCEPTION 'FALHA: deveria haver 1 outcome';
  END IF;
  IF (v_json->'outcomes'->0->>'note') <> 'conversou no estande' THEN
    RAISE EXCEPTION 'FALHA: nota deveria ser normalizada (trim)';
  END IF;

  -- 1b. duplicate/retry: idempotente, sem segundo registro
  v_json := public.staff_record_connection_outcome(v_conn, 'conversa_realizada', 'retry');
  IF (v_json->>'created')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHA: retry não deveria criar segundo outcome';
  END IF;
  SELECT count(*) INTO v_n FROM public.connection_events
   WHERE connection_id = v_conn AND action = 'outcome:conversa_realizada';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: duplicidade de outcome (%)', v_n; END IF;

  -- 1c. tipo inválido é rejeitado
  BEGIN
    PERFORM public.staff_record_connection_outcome(v_conn, 'negocio_fechado_milionario', NULL);
    RAISE EXCEPTION 'FALHA: tipo inválido deveria ser rejeitado';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM NOT LIKE '%invalid_outcome_kind%' THEN RAISE; END IF;
  END;

  -- 1d. nota longa demais é rejeitada
  BEGIN
    PERFORM public.staff_record_connection_outcome(v_conn, 'reuniao_agendada', repeat('a', 281));
    RAISE EXCEPTION 'FALHA: nota longa deveria ser rejeitada';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM NOT LIKE '%note_too_long%' THEN RAISE; END IF;
  END;

  -- 1e. status operacional NÃO é alterado pelo outcome
  SELECT count(*) INTO v_n FROM public.connections
   WHERE id = v_conn AND status = 'apresentados';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: outcome não pode alterar status operacional'; END IF;

  -- 1f. ator é o usuário autenticado (sem spoofing possível: RPC ignora entrada)
  SELECT count(*) INTO v_n FROM public.connection_events
   WHERE connection_id = v_conn AND action = 'outcome:conversa_realizada'
     AND actor_user_id = v_staff AND event_id = v_ev;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: ator/event_id do outcome incorretos'; END IF;

  -- 1g. segundo tipo de outcome coexiste
  PERFORM public.staff_record_connection_outcome(v_conn, 'reuniao_agendada', NULL);

  RESET role;

  ---------------------------------------------------------------------------
  -- 2. AUTORIZAÇÃO: staff de outro evento e visitante não registram outcome
  ---------------------------------------------------------------------------
  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_out, 'role', 'authenticated')::text);
  BEGIN
    PERFORM public.staff_record_connection_outcome(v_conn, 'proposta_solicitada', NULL);
    RAISE EXCEPTION 'FALHA: staff de outro evento não pode registrar outcome';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET role;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_visitor, 'role', 'authenticated')::text);
  BEGIN
    PERFORM public.staff_record_connection_outcome(v_conn, 'proposta_solicitada', NULL);
    RAISE EXCEPTION 'FALHA: visitante não pode registrar outcome';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  ---------------------------------------------------------------------------
  -- 3. ANALYTICS: evento válido do visitante autenticado
  ---------------------------------------------------------------------------
  INSERT INTO public.analytics_events (event_id, profile_id, kind, payload)
  VALUES (v_ev, v_pa, 'onboarding_started', '{"source":"create"}'::jsonb);

  INSERT INTO public.analytics_events (event_id, profile_id, kind, payload)
  VALUES (v_ev, v_pa, 'match_viewed', jsonb_build_object('match_id', v_match, 'score', 80));

  -- 3b. evento inválido (fora da allowlist) é bloqueado pela RLS
  BEGIN
    INSERT INTO public.analytics_events (event_id, kind, payload)
    VALUES (v_ev, 'evento_inventado', '{}'::jsonb);
    RAISE EXCEPTION 'FALHA: kind fora da allowlist deveria ser bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 3c. actor spoofing: cliente não consegue gravar outro actor_user_id
  INSERT INTO public.analytics_events (event_id, profile_id, actor_user_id, kind, payload)
  VALUES (v_ev, v_pa, v_admin, 'match_viewed', jsonb_build_object('match_id', v_match));
  SELECT count(*) INTO v_n FROM public.analytics_events
   WHERE event_id = v_ev AND actor_user_id = v_admin;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: actor spoofing aceito'; END IF;

  -- 3d. event_id inexistente é bloqueado
  BEGIN
    INSERT INTO public.analytics_events (event_id, kind, payload)
    VALUES ('evento-que-nao-existe', 'match_viewed', '{}'::jsonb);
    RAISE EXCEPTION 'FALHA: event_id inválido deveria ser bloqueado';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN NULL;
  END;

  -- 3e. profile de terceiro é bloqueado (visitante só grava para o próprio perfil)
  BEGIN
    INSERT INTO public.analytics_events (event_id, profile_id, kind, payload)
    VALUES (v_ev, v_pb, 'match_viewed', '{}'::jsonb);
    RAISE EXCEPTION 'FALHA: profile_id de terceiro deveria ser bloqueado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 3f. leitura é negada ao cliente (analytics não é legível por RLS)
  SELECT count(*) INTO v_n FROM public.analytics_events WHERE event_id = v_ev;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: analytics_events não deveria ser legível pelo cliente'; END IF;

  RESET role;

  -- 3g. PII: nenhum payload gravado contém dados pessoais
  SELECT count(*) INTO v_n FROM public.analytics_events
   WHERE event_id = v_ev
     AND (payload::text ILIKE '%Empresa A%' OR payload::text ILIKE '%Prova A%'
          OR payload ?| ARRAY['name','email','whatsapp','company','summary']);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: PII encontrada em analytics_events'; END IF;

  SELECT count(*) INTO v_n FROM public.analytics_events WHERE event_id = v_ev;
  IF v_n <> 3 THEN RAISE EXCEPTION 'FALHA: esperados 3 eventos válidos, vieram %', v_n; END IF;

  ---------------------------------------------------------------------------
  -- 4. AGREGAÇÃO ADMIN
  ---------------------------------------------------------------------------
  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_staff, 'role', 'authenticated')::text);
  BEGIN
    PERFORM public.admin_experience_analytics(v_ev);
    RAISE EXCEPTION 'FALHA: staff comum não pode ver a agregação admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET role;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);
  v_json := public.admin_experience_analytics(v_ev);
  RESET role;

  IF (v_json->>'matches_total')::int <> 1 THEN RAISE EXCEPTION 'FALHA: matches_total'; END IF;
  IF (v_json->>'profiles_with_match')::int <> 2 THEN RAISE EXCEPTION 'FALHA: profiles_with_match'; END IF;
  IF (v_json->>'interests')::int <> 2 THEN RAISE EXCEPTION 'FALHA: interests'; END IF;
  IF (v_json->>'mutual_interests')::int <> 1 THEN RAISE EXCEPTION 'FALHA: mutual_interests'; END IF;
  IF (v_json->>'connections_total')::int <> 1 THEN RAISE EXCEPTION 'FALHA: connections_total'; END IF;
  IF (v_json->>'connections_presented')::int <> 1 THEN RAISE EXCEPTION 'FALHA: connections_presented'; END IF;
  IF (v_json->>'outcomes_total')::int <> 2 THEN RAISE EXCEPTION 'FALHA: outcomes_total'; END IF;
  IF (v_json->>'connections_with_outcome')::int <> 1 THEN RAISE EXCEPTION 'FALHA: connections_with_outcome'; END IF;
  IF (v_json->'outcomes'->>'conversa_realizada')::int <> 1 THEN RAISE EXCEPTION 'FALHA: outcome conversa'; END IF;
  IF (v_json->'product_events'->>'match_viewed')::int <> 2 THEN RAISE EXCEPTION 'FALHA: product_events'; END IF;

  -- 4b. isolamento por evento: agregação do evento 2 não vê nada do evento 1
  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_out, 'role', 'authenticated')::text);
  v_json := public.admin_experience_analytics(v_ev2);
  RESET role;
  IF (v_json->>'connections_total')::int <> 0 OR (v_json->>'outcomes_total')::int <> 0 THEN
    RAISE EXCEPTION 'FALHA: vazamento entre eventos na agregação';
  END IF;

  ---------------------------------------------------------------------------
  -- 5. REMOÇÃO DE OUTCOME: auditável e reversível
  ---------------------------------------------------------------------------
  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_admin, 'role', 'authenticated')::text);
  v_json := public.staff_remove_connection_outcome(v_conn, 'reuniao_agendada');
  IF (v_json->>'removed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA: remoção'; END IF;
  IF jsonb_array_length(v_json->'outcomes') <> 1 THEN RAISE EXCEPTION 'FALHA: deveria restar 1 outcome'; END IF;

  -- remoção idempotente
  v_json := public.staff_remove_connection_outcome(v_conn, 'reuniao_agendada');
  IF (v_json->>'removed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHA: remoção repetida'; END IF;

  -- re-registro após remoção é possível
  v_json := public.staff_record_connection_outcome(v_conn, 'reuniao_agendada', NULL);
  IF (v_json->>'created')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA: re-registro'; END IF;
  RESET role;

  SELECT count(*) INTO v_n FROM public.connection_events
   WHERE connection_id = v_conn AND action = 'outcome_removed';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA: remoção deveria deixar rastro auditável'; END IF;

  -- 6. detalhe da conexão expõe os outcomes
  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
                 json_build_object('sub', v_staff, 'role', 'authenticated')::text);
  v_json := public.staff_list_connection_detail(v_conn);
  RESET role;
  IF jsonb_array_length(v_json->'outcomes') <> 2 THEN
    RAISE EXCEPTION 'FALHA: detalhe deveria trazer 2 outcomes';
  END IF;

  RAISE NOTICE 'OUTCOMES+ANALYTICS OK';

  ---------------------------------------------------------------------------
  -- Limpeza
  ---------------------------------------------------------------------------
  DELETE FROM public.analytics_events WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.connection_events WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.connections WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.match_decisions WHERE match_id = v_match;
  DELETE FROM public.match_reasons WHERE match_id = v_match;
  DELETE FROM public.matches WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.profiles WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.audit_logs WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM public.event_staff WHERE event_id IN (v_ev, v_ev2);
  DELETE FROM auth.users WHERE id IN (v_admin, v_staff, v_out, v_visitor);
  DELETE FROM public.events WHERE id IN (v_ev, v_ev2);

  v_ok := true;
  IF NOT v_ok THEN RAISE EXCEPTION 'unreachable'; END IF;
END $proof$;
