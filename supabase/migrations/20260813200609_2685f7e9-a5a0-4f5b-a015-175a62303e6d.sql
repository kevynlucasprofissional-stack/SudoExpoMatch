DO $$
DECLARE
  ev  text := 'proof-impl10-a';
  ev2 text := 'proof-impl10-b';
  u_admin uuid := gen_random_uuid();
  u_admin2 uuid := gen_random_uuid();
  u_staff uuid := gen_random_uuid();
  seg1 text; seg2 text;
  -- IDs ordenados: a tabela matches exige a_profile_id < b_profile_id.
  pa uuid := '10a10000-0000-4000-8000-000000000001';
  pb uuid := '10a10000-0000-4000-8000-000000000002';
  pc uuid := '10a10000-0000-4000-8000-000000000003';
  pz uuid := '10a10000-0000-4000-8000-000000000004';
  pz2 uuid := '10a10000-0000-4000-8000-000000000005';
  m_direct uuid := gen_random_uuid();
  m_comp   uuid := gen_random_uuid();
  m_other  uuid := gen_random_uuid();
  conn uuid := gen_random_uuid();
  ti_from uuid := gen_random_uuid();
  ti_to   uuid := gen_random_uuid();
  rel uuid := gen_random_uuid();
  need uuid := gen_random_uuid();
  offr uuid := gen_random_uuid();
  r jsonb; j jsonb; k jsonb;
  ok boolean;
BEGIN
  SELECT id INTO seg1 FROM public.segments ORDER BY sort_order LIMIT 1;
  SELECT id INTO seg2 FROM public.segments ORDER BY sort_order OFFSET 1 LIMIT 1;

  INSERT INTO public.events(id,name,city,is_active) VALUES
    (ev,'Proof10 A','Rio Verde',true), (ev2,'Proof10 B','Jatai',true);

  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password,
                         created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT x, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         'proof10-'||x||'@example.invalid','',now(),now(),'{}'::jsonb,'{}'::jsonb
    FROM unnest(ARRAY[u_admin,u_admin2,u_staff]) x;

  INSERT INTO public.event_staff(event_id,user_id,role) VALUES
    (ev,u_admin,'admin'), (ev2,u_admin2,'admin'), (ev,u_staff,'staff');

  INSERT INTO public.profiles(id,event_id,name,company,city,whatsapp,segment_id,summary,offers,needs,consent,recovery_code)
  VALUES
    (pa,ev,'Ana Prova','Padaria Prova','Rio Verde','+5564900000021',seg1,'a','[]','[]',true,'h1'),
    (pb,ev,'Bruno Prova','Beta Prova','Rio Verde','+5564900000022',seg2,'b','[]','[]',true,'h2'),
    (pc,ev,'Carla Prova','Gama Prova','Rio Verde','+5564900000023',seg2,'c','[]','[]',true,'h3'),
    (pz,ev2,'Zeca Prova','Zeta Prova','Jatai','+5564900000024',seg1,'z','[]','[]',true,'h4'),
    (pz2,ev2,'Yara Prova','Yota Prova','Jatai','+5564900000025',seg2,'y','[]','[]',true,'h5');

  INSERT INTO public.profile_needs(id,profile_id,event_id,text,label,need_kind,sort_order,segment_id)
  VALUES (need,pa,ev,'preciso de embalagem','Embalagem personalizada','servico',0,seg1);
  INSERT INTO public.profile_offers(id,profile_id,event_id,text,label,sort_order,segment_id)
  VALUES (offr,pb,ev,'grafica','Gráfica rápida',0,seg2);

  INSERT INTO public.taxonomy_items(id,slug,label,kind,segment_id)
  VALUES (ti_from,'proof10-emb','Embalagem personalizada','need',seg1),
         (ti_to,'proof10-graf','Gráfica rápida','offer',seg2);
  INSERT INTO public.taxonomy_relations(id,from_taxonomy_item_id,to_taxonomy_item_id,relation_type,weight,rationale,active)
  VALUES (rel,ti_from,ti_to,'complements',90,'Gráfica atende embalagem personalizada',true);

  -- match direto simétrico
  INSERT INTO public.matches(id,event_id,a_profile_id,b_profile_id,kind,score_for_a,score_for_b,
                             label,reasons_for_a,reasons_for_b,decision_a,decision_b,algorithm_version,is_active)
  VALUES (m_direct,ev,pa,pc,'direto',80,80,'conexao_possivel','[]','[]','sem_decisao','sem_decisao','v2.3',true),
         -- assimétrico 85/35 com colunas legadas divergentes de propósito
         (m_comp,ev,pa,pb,'complementar',85,35,'conexao_possivel','[]','[]','agora_nao','interesse','v2.3',true),
         -- outro evento (isolamento) e versão antiga
         (m_other,ev2,pz,pz2,'direto',50,50,'boa_oportunidade','[]','[]','sem_decisao','sem_decisao','v2.2',true);

  INSERT INTO public.match_reasons(match_id,perspective_profile_id,code,label,weight)
  VALUES (m_direct,pa,'outro_oferece_o_que_procuro','O outro oferece o que você procura',55),
         (m_direct,pc,'outro_procura_o_que_ofereco','O outro procura o que você oferece',25);

  INSERT INTO public.match_reasons(match_id,perspective_profile_id,code,label,weight,
                                   profile_need_id,profile_offer_id,taxonomy_relation_id,relation_weight,rationale)
  VALUES (m_comp,pa,'relacao_complementar','A oferta do outro é complementar ao que você procura',27,
          need,offr,rel,90,'Rationale historico do match');

  INSERT INTO public.match_decisions(match_id,profile_id,decision)
  VALUES (m_comp,pa,'interesse'), (m_comp,pb,'interesse');

  INSERT INTO public.connections(id,match_id,event_id,a_profile_id,b_profile_id,status)
  VALUES (conn,m_direct,ev,pa,pc,'em_atendimento');

  -- ===== negações =====
  PERFORM set_config('request.jwt.claims', NULL, true);
  ok := false;
  BEGIN PERFORM public.admin_list_matches(ev); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A1: anon listou'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_staff,'role','authenticated')::text, true);
  ok := false;
  BEGIN PERFORM public.admin_list_matches(ev); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A2: staff nao-admin listou'; END IF;
  ok := false;
  BEGIN PERFORM public.admin_get_match_detail(m_direct); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A3: staff nao-admin abriu detalhe'; END IF;

  -- admin do evento B nao acessa match do evento A
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_admin2,'role','authenticated')::text, true);
  ok := false;
  BEGIN PERFORM public.admin_get_match_detail(m_direct); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A4: cross-event detalhe'; END IF;
  ok := false;
  BEGIN PERFORM public.admin_list_matches(ev); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A5: cross-event lista'; END IF;

  -- match inexistente => erro tratavel
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_admin,'role','authenticated')::text, true);
  ok := false;
  BEGIN PERFORM public.admin_get_match_detail(gen_random_uuid()); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL A6: match inexistente sem erro'; END IF;

  -- ===== lista =====
  r := public.admin_list_matches(ev);
  IF (r->>'total')::int <> 2 THEN RAISE EXCEPTION 'FAIL L1: total=% (isolamento de evento)', r->>'total'; END IF;

  SELECT i INTO j FROM jsonb_array_elements(r->'items') i WHERE i->>'id' = m_comp::text;
  IF (j->>'score_for_a')::int <> 85 OR (j->>'label_a') <> 'alta_compatibilidade'
     OR (j->>'score_for_b')::int <> 35 OR (j->>'label_b') <> 'conexao_possivel' THEN
    RAISE EXCEPTION 'FAIL L2: labels por perspectiva %', j;
  END IF;
  IF (j->>'decision_a') <> 'interesse' OR (j->>'decision_b') <> 'interesse'
     OR (j->>'mutual')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL L3: decisoes autoritativas/mutual % (legado a=agora_nao)', j;
  END IF;
  IF (j->>'score_gap')::int <> 50 THEN RAISE EXCEPTION 'FAIL L4: gap'; END IF;
  IF j->>'connection_id' IS NOT NULL THEN RAISE EXCEPTION 'FAIL L5: conexao inexistente'; END IF;

  SELECT i INTO k FROM jsonb_array_elements(r->'items') i WHERE i->>'id' = m_direct::text;
  IF (k->>'connection_id') <> conn::text OR (k->>'connection_status') <> 'em_atendimento' THEN
    RAISE EXCEPTION 'FAIL L6: conexao %', k;
  END IF;
  IF (k->>'decision_a') <> 'sem_decisao' OR (k->>'mutual')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL L7: coalesce/mutual %', k;
  END IF;

  -- filtros
  IF (public.admin_list_matches(ev,'bruno')->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F1: busca'; END IF;
  IF (public.admin_list_matches(ev,'Gama')->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F2: busca empresa'; END IF;
  IF (public.admin_list_matches(ev,NULL,ARRAY['complementar'])->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F3: kind'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,ARRAY['alta_compatibilidade'],'b')->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F4: label lado B'; END IF;
  -- 80/80 é alta dos dois lados; 85/35 não é. 'both' precisa exigir os dois lados.
  IF (public.admin_list_matches(ev,NULL,NULL,ARRAY['alta_compatibilidade'],'both')->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F5: label ambos'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,ARRAY['conexao_possivel'],'both')->>'total')::int <> 0 THEN RAISE EXCEPTION 'FAIL F5b: label ambos negativo'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,ARRAY['conexao_possivel'],'any')->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F5c: label qualquer lado'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'both',40)->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F6: min score both'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'a',NULL,80)->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F7: max score lado A'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,ARRAY[seg1])->>'total')::int <> 2 THEN RAISE EXCEPTION 'FAIL F8: segmento'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,ARRAY['interesse'])->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F9: decisao'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,true)->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F10: mutual'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,false,'with')->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F11: com conexao'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,false,'without')->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL F12: sem conexao'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,false,'any',ARRAY['concluido'])->>'total')::int <> 0 THEN RAISE EXCEPTION 'FAIL F13: status conexao'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,false,'any',NULL,ARRAY['v2.2'])->>'total')::int <> 0 THEN RAISE EXCEPTION 'FAIL F14: versao'; END IF;
  IF (public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,false,'any',NULL,ARRAY['v2.3'])->>'total')::int <> 2 THEN RAISE EXCEPTION 'FAIL F15: versao v2.3'; END IF;

  -- paginacao + limite defensivo + total independente da pagina
  r := public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,false,'any',NULL,NULL,'score_desc',1,0);
  IF jsonb_array_length(r->'items') <> 1 OR (r->>'total')::int <> 2 THEN RAISE EXCEPTION 'FAIL P1: paginacao %', r; END IF;
  IF (r->'items'->0->>'id') <> m_comp::text THEN RAISE EXCEPTION 'FAIL P2: ordem score_desc'; END IF;
  r := public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,false,'any',NULL,NULL,'score_desc',1,1);
  IF (r->'items'->0->>'id') <> m_direct::text THEN RAISE EXCEPTION 'FAIL P3: offset'; END IF;
  r := public.admin_list_matches(ev,NULL,NULL,NULL,'any',NULL,NULL,NULL,NULL,false,'any',NULL,NULL,'gap_desc',9999,0);
  IF (r->>'limit')::int <> 100 THEN RAISE EXCEPTION 'FAIL P4: clamp limite=%', r->>'limit'; END IF;
  IF (r->'items'->0->>'id') <> m_comp::text THEN RAISE EXCEPTION 'FAIL P5: ordem gap_desc'; END IF;

  -- ===== detalhe =====
  r := public.admin_get_match_detail(m_comp);
  IF (r->'match'->>'label_a') <> 'alta_compatibilidade' OR (r->'match'->>'label_b') <> 'conexao_possivel' THEN
    RAISE EXCEPTION 'FAIL D1: labels detalhe %', r->'match';
  END IF;
  IF (r->'match'->>'decision_a') <> 'interesse' OR (r->'match'->>'mutual')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL D2: decisoes detalhe %', r->'match';
  END IF;
  IF (r->'profile_a'->>'name') <> 'Ana Prova' OR (r->'profile_b'->>'name') <> 'Bruno Prova' THEN
    RAISE EXCEPTION 'FAIL D3: perfis';
  END IF;
  IF r->'connection' IS NOT NULL AND r->>'connection' <> 'null' THEN RAISE EXCEPTION 'FAIL D4: conexao inexistente'; END IF;

  j := r->'reasons_a'->0;
  IF (j->>'code') <> 'relacao_complementar' OR (j->>'is_complement')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL D5: reason complementar %', j;
  END IF;
  IF (j->>'profile_need_id') <> need::text OR (j->>'profile_offer_id') <> offr::text
     OR (j->>'taxonomy_relation_id') <> rel::text OR (j->>'relation_weight')::int <> 90
     OR (j->>'rationale_historic') <> 'Rationale historico do match' THEN
    RAISE EXCEPTION 'FAIL D6: ids/rationale historico %', j;
  END IF;
  IF (j->'need'->>'label') <> 'Embalagem personalizada' OR (j->'offer'->>'label') <> 'Gráfica rápida' THEN
    RAISE EXCEPTION 'FAIL D7: need/offer %', j;
  END IF;
  IF (j->'relation_current'->>'relation_type') <> 'complements'
     OR (j->'relation_current'->>'weight')::int <> 90
     OR (j->'relation_current'->>'active')::boolean IS NOT TRUE
     OR (j->'relation_current'->>'from_item_label') <> 'Embalagem personalizada'
     OR (j->'relation_current'->>'to_item_label') <> 'Gráfica rápida'
     OR (j->'relation_current'->>'rationale_current') <> 'Gráfica atende embalagem personalizada' THEN
    RAISE EXCEPTION 'FAIL D8: relation atual %', j->'relation_current';
  END IF;

  -- reason direto: sem IDs complementares
  r := public.admin_get_match_detail(m_direct);
  j := r->'reasons_a'->0;
  IF (j->>'code') <> 'outro_oferece_o_que_procuro' OR (j->>'is_complement')::boolean IS NOT FALSE
     OR j->>'profile_need_id' IS NOT NULL OR j->>'taxonomy_relation_id' IS NOT NULL
     OR j->'relation_current' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL D9: reason direto %', j;
  END IF;
  IF (r->'connection'->>'status') <> 'em_atendimento' THEN RAISE EXCEPTION 'FAIL D10: conexao detalhe'; END IF;
  IF jsonb_array_length(r->'reasons_b') <> 1 THEN RAISE EXCEPTION 'FAIL D11: reasons_b'; END IF;

  -- relation apagada => SET NULL, historico basico continua legivel
  DELETE FROM public.taxonomy_relations WHERE id = rel;
  r := public.admin_get_match_detail(m_comp);
  j := r->'reasons_a'->0;
  IF (j->>'rationale_historic') <> 'Rationale historico do match'
     OR (j->>'relation_weight')::int <> 90
     OR j->'relation_current' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL D12: historico apos delete da relation %', j;
  END IF;

  -- PII fora
  IF r::text ILIKE '%whatsapp%' OR r::text ILIKE '%+55649%' OR r::text ILIKE '%recovery%' THEN
    RAISE EXCEPTION 'FAIL D13: PII detalhe';
  END IF;
  r := public.admin_list_matches(ev);
  IF r::text ILIKE '%whatsapp%' OR r::text ILIKE '%+55649%' OR r::text ILIKE '%recovery%' THEN
    RAISE EXCEPTION 'FAIL L8: PII lista';
  END IF;

  -- ===== cleanup =====
  PERFORM set_config('request.jwt.claims', NULL, true);
  DELETE FROM public.match_decisions WHERE match_id IN (m_direct,m_comp,m_other);
  DELETE FROM public.match_status_history WHERE match_id IN (m_direct,m_comp,m_other);
  DELETE FROM public.match_reasons WHERE match_id IN (m_direct,m_comp,m_other);
  DELETE FROM public.connection_events WHERE event_id IN (ev,ev2);
  DELETE FROM public.connection_notes WHERE event_id IN (ev,ev2);
  DELETE FROM public.connection_status_history WHERE connection_id IN (SELECT id FROM public.connections WHERE event_id IN (ev,ev2));
  DELETE FROM public.connections WHERE event_id IN (ev,ev2);
  DELETE FROM public.matches WHERE event_id IN (ev,ev2);
  DELETE FROM public.audit_logs WHERE event_id IN (ev,ev2);
  DELETE FROM public.analytics_events WHERE event_id IN (ev,ev2);
  DELETE FROM public.ai_runs WHERE event_id IN (ev,ev2);
  DELETE FROM public.consents WHERE event_id IN (ev,ev2);
  DELETE FROM public.profile_needs WHERE event_id IN (ev,ev2);
  DELETE FROM public.profile_offers WHERE event_id IN (ev,ev2);
  DELETE FROM public.profile_segments WHERE profile_id IN (pa,pb,pc,pz,pz2);
  DELETE FROM public.profiles WHERE event_id IN (ev,ev2);
  DELETE FROM public.event_staff WHERE event_id IN (ev,ev2);
  DELETE FROM public.events WHERE id IN (ev,ev2);
  DELETE FROM public.taxonomy_relations WHERE from_taxonomy_item_id IN (ti_from,ti_to) OR to_taxonomy_item_id IN (ti_from,ti_to);
  DELETE FROM public.taxonomy_items WHERE id IN (ti_from,ti_to);
  DELETE FROM auth.users WHERE id IN (u_admin,u_admin2,u_staff);

  RAISE NOTICE 'IMPL10 PROOF OK';
END $$;