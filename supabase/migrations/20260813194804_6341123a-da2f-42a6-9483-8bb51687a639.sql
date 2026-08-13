DO $$
DECLARE
  ev text := 'proof-impl9-a';
  ev2 text := 'proof-impl9-b';
  u_admin uuid := gen_random_uuid();
  u_staff uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_part uuid := gen_random_uuid();
  seg1 text; seg2 text;
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  p3 uuid := gen_random_uuid();
  r jsonb; n int; ok boolean;
BEGIN
  SELECT id INTO seg1 FROM public.segments ORDER BY sort_order LIMIT 1;
  SELECT id INTO seg2 FROM public.segments ORDER BY sort_order OFFSET 1 LIMIT 1;

  INSERT INTO public.events(id,name,city,is_active) VALUES
    (ev,'Proof A','Rio Verde',true),(ev2,'Proof B','Outra',true);
  -- contas temporarias apenas para satisfazer a FK; removidas no cleanup
  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password,
                         created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'proof-impl9-' || x.id || '@example.invalid', '', now(), now(), '{}'::jsonb, '{}'::jsonb
    FROM (VALUES (u_admin),(u_staff),(u_admin_b),(u_part)) AS x(id);
  INSERT INTO public.event_staff(event_id,user_id,role) VALUES
    (ev,u_admin,'admin'),(ev,u_staff,'staff'),(ev2,u_admin_b,'admin');

  INSERT INTO public.profiles(id,event_id,name,company,city,whatsapp,segment_id,summary,offers,needs,consent,recovery_code)
  VALUES
    (p1,ev,'Ana Souza','Padaria Bela','Rio Verde','+5564900000001',seg1,'resumo a','[]','[]',true,'x1'),
    (p2,ev,'Bruno Lima','AgÊncia Beta','Goiânia','+5564900000002',seg2,'resumo b','[]','[]',true,'x2'),
    (p3,ev2,'Carla Dias','Outro Evento','Rio Verde','+5564900000003',seg1,'resumo c','[]','[]',true,'x3');

  INSERT INTO public.profile_offers(profile_id,event_id,label,text,segment_id,sort_order,active)
  VALUES (p1,ev,'Pães','Pães',seg1,0,true),(p1,ev,'Bolos','Bolos',seg1,1,true);
  INSERT INTO public.profile_needs(profile_id,event_id,label,text,segment_id,sort_order,active,need_kind,is_priority)
  VALUES (p1,ev,'Marketing','Marketing',seg2,0,true,'servico',true);

  -- 1) admin do evento lista
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_admin,'role','authenticated')::text, true);
  r := public.admin_list_participants(ev, NULL, NULL, NULL, 25, 0);
  IF (r->>'total')::int <> 2 THEN RAISE EXCEPTION 'FAIL 1: total=% (esperado 2)', r->>'total'; END IF;
  IF jsonb_array_length(r->'items') <> 2 THEN RAISE EXCEPTION 'FAIL 2: items'; END IF;
  -- isolamento: nenhum perfil do evento B
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'items') i WHERE i->>'id' = p3::text) THEN
    RAISE EXCEPTION 'FAIL 3: vazamento de evento';
  END IF;
  -- counts corretos
  SELECT (i->>'offers_count')::int INTO n FROM jsonb_array_elements(r->'items') i WHERE i->>'id'=p1::text;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 4: offers_count=%', n; END IF;
  SELECT (i->>'needs_count')::int INTO n FROM jsonb_array_elements(r->'items') i WHERE i->>'id'=p1::text;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 5: needs_count=%', n; END IF;

  -- 2) busca case/acento-insensivel-ish (ILIKE) por empresa
  r := public.admin_list_participants(ev, 'padaria', NULL, NULL, 25, 0);
  IF (r->>'total')::int <> 1 OR (r->'items'->0->>'id') <> p1::text THEN RAISE EXCEPTION 'FAIL 6: busca'; END IF;
  -- busca com curinga literal nao vira padrao
  r := public.admin_list_participants(ev, '%', NULL, NULL, 25, 0);
  IF (r->>'total')::int <> 0 THEN RAISE EXCEPTION 'FAIL 7: curinga nao escapado'; END IF;

  -- 3) filtros
  r := public.admin_list_participants(ev, NULL, ARRAY[seg2], NULL, 25, 0);
  IF (r->>'total')::int <> 1 OR (r->'items'->0->>'id') <> p2::text THEN RAISE EXCEPTION 'FAIL 8: filtro segmento'; END IF;
  r := public.admin_list_participants(ev, NULL, NULL, 'rio verde', 25, 0);
  IF (r->>'total')::int <> 1 OR (r->'items'->0->>'id') <> p1::text THEN RAISE EXCEPTION 'FAIL 9: filtro cidade'; END IF;

  -- 4) paginacao e limite defensivo
  r := public.admin_list_participants(ev, NULL, NULL, NULL, 1, 0);
  IF jsonb_array_length(r->'items') <> 1 OR (r->>'total')::int <> 2 THEN RAISE EXCEPTION 'FAIL 10: paginacao'; END IF;
  r := public.admin_list_participants(ev, NULL, NULL, NULL, 1, 1);
  IF jsonb_array_length(r->'items') <> 1 THEN RAISE EXCEPTION 'FAIL 11: offset'; END IF;
  r := public.admin_list_participants(ev, NULL, NULL, NULL, 100000, -5);
  IF (r->>'limit')::int <> 100 OR (r->>'offset')::int <> 0 THEN RAISE EXCEPTION 'FAIL 12: clamp'; END IF;

  -- 5) evento inexistente => forbidden
  BEGIN
    r := public.admin_list_participants('nao-existe', NULL, NULL, NULL, 25, 0);
    RAISE EXCEPTION 'FAIL 13: evento inexistente permitido';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  -- 6) detalhe do admin correto, sem PII
  r := public.admin_get_participant_detail(p1);
  IF (r->'profile'->>'name') <> 'Ana Souza' THEN RAISE EXCEPTION 'FAIL 14: detalhe'; END IF;
  IF jsonb_array_length(r->'offers') <> 2 OR jsonb_array_length(r->'needs') <> 1 THEN RAISE EXCEPTION 'FAIL 15: listas'; END IF;
  IF r::text ILIKE '%whatsapp%' OR r::text ILIKE '%recovery%' OR r::text ILIKE '%+55649%' OR r::text ILIKE '%email%' OR r::text ILIKE '%phone%' THEN
    RAISE EXCEPTION 'FAIL 16: PII no detalhe';
  END IF;

  -- 7) perfil inexistente
  BEGIN
    r := public.admin_get_participant_detail(gen_random_uuid());
    RAISE EXCEPTION 'FAIL 17: perfil inexistente permitido';
  EXCEPTION WHEN sqlstate 'P0002' THEN NULL; END;

  -- 8) staff nao-admin negado
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_staff,'role','authenticated')::text, true);
  BEGIN
    r := public.admin_list_participants(ev, NULL, NULL, NULL, 25, 0);
    RAISE EXCEPTION 'FAIL 18: staff listou';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN
    r := public.admin_get_participant_detail(p1);
    RAISE EXCEPTION 'FAIL 19: staff leu detalhe';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  -- 9) admin do evento B nao acessa evento A
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_admin_b,'role','authenticated')::text, true);
  BEGIN
    r := public.admin_list_participants(ev, NULL, NULL, NULL, 25, 0);
    RAISE EXCEPTION 'FAIL 20: admin B listou evento A';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN
    r := public.admin_get_participant_detail(p1);
    RAISE EXCEPTION 'FAIL 21: admin B leu perfil de A';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  -- 10) participante comum negado
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_part,'role','authenticated')::text, true);
  BEGIN
    r := public.admin_list_participants(ev, NULL, NULL, NULL, 25, 0);
    RAISE EXCEPTION 'FAIL 22: participante listou';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  -- 11) anonimo negado
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    r := public.admin_list_participants(ev, NULL, NULL, NULL, 25, 0);
    RAISE EXCEPTION 'FAIL 23: anonimo listou';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  -- 12) grants: anon sem execute
  SELECT has_function_privilege('anon','public.admin_list_participants(text,text,text[],text,integer,integer)','EXECUTE') INTO ok;
  IF ok THEN RAISE EXCEPTION 'FAIL 24: anon pode executar lista'; END IF;
  SELECT has_function_privilege('anon','public.admin_get_participant_detail(uuid)','EXECUTE') INTO ok;
  IF ok THEN RAISE EXCEPTION 'FAIL 25: anon pode executar detalhe'; END IF;
  SELECT has_function_privilege('authenticated','public.admin_list_participants(text,text,text[],text,integer,integer)','EXECUTE') INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL 26: authenticated sem execute'; END IF;

  -- cleanup
  PERFORM set_config('request.jwt.claims', NULL, true);
  DELETE FROM public.profile_offers WHERE event_id IN (ev,ev2);
  DELETE FROM public.profile_needs WHERE event_id IN (ev,ev2);
  DELETE FROM public.audit_logs WHERE event_id IN (ev,ev2);
  DELETE FROM public.analytics_events WHERE event_id IN (ev,ev2);
  DELETE FROM public.profiles WHERE event_id IN (ev,ev2);
  DELETE FROM public.event_staff WHERE event_id IN (ev,ev2);
  DELETE FROM public.events WHERE id IN (ev,ev2);
  DELETE FROM auth.users WHERE id IN (u_admin,u_staff,u_admin_b,u_part);

  RAISE NOTICE 'IMPL9 PROOF OK';
END $$;