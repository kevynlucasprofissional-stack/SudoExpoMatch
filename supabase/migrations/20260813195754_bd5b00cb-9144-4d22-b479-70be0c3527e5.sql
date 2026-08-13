DO $$
DECLARE
  ev text := 'proof-impl9-hard';
  u_admin uuid := gen_random_uuid();
  seg1 text; seg2 text;
  pa uuid := gen_random_uuid();
  pb uuid := gen_random_uuid();
  pc uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  r jsonb; j jsonb;
BEGIN
  SELECT id INTO seg1 FROM public.segments ORDER BY sort_order LIMIT 1;
  SELECT id INTO seg2 FROM public.segments ORDER BY sort_order OFFSET 1 LIMIT 1;

  INSERT INTO public.events(id,name,city,is_active) VALUES (ev,'Proof Hard','Rio Verde',true);
  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password,
                         created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (u_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'proof-hard-'||u_admin||'@example.invalid','',now(),now(),'{}'::jsonb,'{}'::jsonb);
  INSERT INTO public.event_staff(event_id,user_id,role) VALUES (ev,u_admin,'admin');

  INSERT INTO public.profiles(id,event_id,name,company,city,whatsapp,segment_id,summary,offers,needs,consent,recovery_code)
  VALUES
    (pa,ev,'Ana','Padaria','Rio Verde','+5564900000011',seg1,'a','[]','[]',true,'h1'),
    (pb,ev,'Bruno','Beta','Rio Verde','+5564900000012',seg2,'b','[]','[]',true,'h2'),
    (pc,ev,'Carla','Gama','Rio Verde','+5564900000013',seg2,'c','[]','[]',true,'h3');

  -- match assimetrico 85/35 com colunas legadas propositalmente ERRADAS
  INSERT INTO public.matches(id,event_id,a_profile_id,b_profile_id,kind,score_for_a,score_for_b,
                             label,reasons_for_a,reasons_for_b,decision_a,decision_b,
                             algorithm_version,is_active)
  VALUES (m1,ev,pa,pb,'bidirecional',85,35,'conexao_possivel','[]','[]','agora_nao','sem_decisao','v2.3',true),
         (m2,ev,pa,pc,'direto',60,90,'alta_compatibilidade','[]','[]','sem_decisao','sem_decisao','v2.3',true);

  -- fonte autoritativa: match_decisions
  INSERT INTO public.match_decisions(match_id,profile_id,decision)
  VALUES (m1,pa,'interesse'), (m1,pb,'agora_nao');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_admin,'role','authenticated')::text, true);
  r := public.admin_get_participant_detail(pa);

  -- ordenacao pela perspectiva de pa: 85 (m1) antes de 60 (m2)
  IF (r->'matches'->0->>'id') <> m1::text THEN
    RAISE EXCEPTION 'FAIL H1: ordenacao=% ', r->'matches'->0->>'id';
  END IF;

  SELECT i INTO j FROM jsonb_array_elements(r->'matches') i WHERE i->>'id' = m1::text;

  IF (j->>'score_for_participant')::int <> 85 OR (j->>'score_for_other')::int <> 35 THEN
    RAISE EXCEPTION 'FAIL H2: scores %', j;
  END IF;
  IF (j->>'label_for_participant') <> 'alta_compatibilidade' THEN
    RAISE EXCEPTION 'FAIL H3: label participante=%', j->>'label_for_participant';
  END IF;
  IF (j->>'label_for_other') <> 'conexao_possivel' THEN
    RAISE EXCEPTION 'FAIL H4: label outro=%', j->>'label_for_other';
  END IF;
  IF (j->>'decision_participant') <> 'interesse' THEN
    RAISE EXCEPTION 'FAIL H5: decisao participante=% (legado era agora_nao)', j->>'decision_participant';
  END IF;
  IF (j->>'decision_other') <> 'agora_nao' THEN
    RAISE EXCEPTION 'FAIL H6: decisao outro=% (legado era sem_decisao)', j->>'decision_other';
  END IF;

  -- sem decisao registrada => sem_decisao
  SELECT i INTO j FROM jsonb_array_elements(r->'matches') i WHERE i->>'id' = m2::text;
  IF (j->>'decision_participant') <> 'sem_decisao' OR (j->>'decision_other') <> 'sem_decisao' THEN
    RAISE EXCEPTION 'FAIL H7: coalesce %', j;
  END IF;

  -- perspectiva simetrica: para pb, m1 vale 35 e a label muda
  r := public.admin_get_participant_detail(pb);
  SELECT i INTO j FROM jsonb_array_elements(r->'matches') i WHERE i->>'id' = m1::text;
  IF (j->>'score_for_participant')::int <> 35
     OR (j->>'label_for_participant') <> 'conexao_possivel'
     OR (j->>'label_for_other') <> 'alta_compatibilidade'
     OR (j->>'decision_participant') <> 'agora_nao'
     OR (j->>'decision_other') <> 'interesse' THEN
    RAISE EXCEPTION 'FAIL H8: perspectiva invertida %', j;
  END IF;

  -- PII continua fora
  IF r::text ILIKE '%whatsapp%' OR r::text ILIKE '%+55649%' OR r::text ILIKE '%recovery%' THEN
    RAISE EXCEPTION 'FAIL H9: PII';
  END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  DELETE FROM public.match_decisions WHERE match_id IN (m1,m2);
  DELETE FROM public.match_status_history WHERE match_id IN (m1,m2);
  DELETE FROM public.match_reasons WHERE match_id IN (m1,m2);
  DELETE FROM public.connection_events WHERE event_id = ev;
  DELETE FROM public.connection_status_history WHERE connection_id IN (SELECT id FROM public.connections WHERE event_id = ev);
  DELETE FROM public.connections WHERE event_id = ev;
  DELETE FROM public.matches WHERE event_id = ev;
  DELETE FROM public.audit_logs WHERE event_id = ev;
  DELETE FROM public.analytics_events WHERE event_id = ev;
  DELETE FROM public.profiles WHERE event_id = ev;
  DELETE FROM public.event_staff WHERE event_id = ev;
  DELETE FROM public.events WHERE id = ev;
  DELETE FROM auth.users WHERE id = u_admin;

  RAISE NOTICE 'IMPL9 HARDENING PROOF OK';
END $$;