DO $$
DECLARE
  ev text := 'proof-impl8';
  tx_social uuid; tx_delivery uuid;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  pa uuid; pb uuid;
  m record;
  n_reasons int;
  n_ref int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.segments WHERE id='alimentacao')
     OR NOT EXISTS (SELECT 1 FROM public.segments WHERE id='marketing') THEN
    RAISE EXCEPTION 'IMPL8 SETUP: segmentos ausentes';
  END IF;

  INSERT INTO public.events(id,name,city,is_active) VALUES (ev,'Proof IMPL8','Rio Verde',true);

  INSERT INTO public.taxonomy_items(slug,label,kind,segment_id,active)
  VALUES ('p8-social','P8 Gestao de redes sociais','both','marketing',true) RETURNING id INTO tx_social;
  INSERT INTO public.taxonomy_items(slug,label,kind,segment_id,active)
  VALUES ('p8-delivery','P8 Delivery de refeicoes','both','alimentacao',true) RETURNING id INTO tx_delivery;

  INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  VALUES (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','p8a-'||ua||'@proof.local','x',now(),now(),now()),
         (ub,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','p8b-'||ub||'@proof.local','x',now(),now(),now());

  -- Empresa A: restaurante (alimentacao) com NECESSIDADE cross-segment de marketing
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  pa := public.save_own_profile_v2(jsonb_build_object(
    'event_id',ev,'name','Ana','company','Restaurante P8','city','Rio Verde',
    'segment_id','alimentacao','summary','Restaurante com delivery crescendo, precisa divulgar melhor.',
    'consent',true,
    'offers',jsonb_build_array(jsonb_build_object(
      'label','P8 Delivery de refeicoes','segment_id','alimentacao','taxonomy_item_id',tx_delivery,'source','user')),
    'needs',jsonb_build_array(jsonb_build_object(
      'label','P8 Gestao de redes sociais','segment_id','marketing','taxonomy_item_id',tx_social,
      'need_kind','servico','is_priority',true,'source','ai','user_confirmed',true))
  ));

  -- Empresa B: agência de marketing que OFERECE exatamente o item
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ub,'role','authenticated')::text, true);
  pb := public.save_own_profile_v2(jsonb_build_object(
    'event_id',ev,'name','Bruno','company','Agencia P8','city','Rio Verde',
    'segment_id','marketing','summary','Agencia de marketing digital focada em redes sociais e trafego.',
    'consent',true,
    'offers',jsonb_build_array(jsonb_build_object(
      'label','P8 Gestao de redes sociais','segment_id','marketing','taxonomy_item_id',tx_social,'source','user')),
    'needs',jsonb_build_array(jsonb_build_object(
      'label','P8 Delivery de refeicoes','segment_id','alimentacao','taxonomy_item_id',tx_delivery,
      'need_kind','servico','is_priority',true,'source','user','user_confirmed',true))
  ));

  RESET role;
  PERFORM set_config('request.jwt.claims','',true);

  -- Match gerado automaticamente pelo recompute do save
  SELECT * INTO m FROM public.matches
   WHERE event_id=ev AND is_active
     AND ((a_profile_id=pa AND b_profile_id=pb) OR (a_profile_id=pb AND b_profile_id=pa));
  IF m IS NULL THEN RAISE EXCEPTION 'IMPL8 FAIL 1: match nao gerado a partir de dados persistidos'; END IF;
  IF m.algorithm_version IS DISTINCT FROM 'v2.3' THEN
    RAISE EXCEPTION 'IMPL8 FAIL 2: algorithm_version=% (esperado v2.3)', m.algorithm_version;
  END IF;
  IF m.score_for_a < 40 OR m.score_for_b < 40 THEN
    RAISE EXCEPTION 'IMPL8 FAIL 3: scores baixos a=% b=%', m.score_for_a, m.score_for_b;
  END IF;
  IF m.kind <> 'bidirecional' THEN
    RAISE EXCEPTION 'IMPL8 FAIL 4: kind=% (esperado bidirecional)', m.kind;
  END IF;
  IF m.label IS NULL THEN RAISE EXCEPTION 'IMPL8 FAIL 5: label nulo'; END IF;

  SELECT count(*) INTO n_reasons FROM public.match_reasons WHERE match_id=m.id;
  IF n_reasons = 0 THEN RAISE EXCEPTION 'IMPL8 FAIL 6: sem reasons explicaveis'; END IF;

  -- Rastreio por perspectiva: A recebe a razao literal de que o outro oferece
  -- o que ela procura (a necessidade cross-segment persistida em marketing).
  SELECT count(*) INTO n_ref
    FROM public.match_reasons r
   WHERE r.match_id=m.id AND r.perspective_profile_id=pa
     AND r.code='outro_oferece_o_que_procuro';
  IF n_ref = 0 THEN
    RAISE EXCEPTION 'IMPL8 FAIL 7: A nao recebeu a razao da necessidade cross-segment';
  END IF;

  -- E o dado que gerou essa razao e mesmo cross-segment persistido:
  -- perfil em alimentacao, necessidade com o segmento do proprio taxonomy item.
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_needs pn
     WHERE pn.profile_id=pa AND pn.taxonomy_item_id=tx_social
       AND pn.segment_id='marketing' AND pn.active
  ) THEN
    RAISE EXCEPTION 'IMPL8 FAIL 8: necessidade cross-segment nao persistida em marketing';
  END IF;
  IF (SELECT segment_id FROM public.profiles WHERE id=pa) <> 'alimentacao' THEN
    RAISE EXCEPTION 'IMPL8 FAIL 9: profile.segment_id de A foi alterado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.match_reasons r
     WHERE r.match_id=m.id AND r.perspective_profile_id=pb
       AND r.code='outro_procura_o_que_ofereco'
  ) THEN
    RAISE EXCEPTION 'IMPL8 FAIL 10: B nao recebeu a razao simetrica';
  END IF;

  RAISE NOTICE 'IMPL8 OK: match % score_a=% score_b=% label=% reasons=%',
    m.kind, m.score_for_a, m.score_for_b, m.label, n_reasons;

  -- Limpeza total
  DELETE FROM public.match_reasons WHERE match_id IN (SELECT id FROM public.matches WHERE event_id=ev);
  DELETE FROM public.match_status_history WHERE match_id IN (SELECT id FROM public.matches WHERE event_id=ev);
  DELETE FROM public.match_decisions WHERE match_id IN (SELECT id FROM public.matches WHERE event_id=ev);
  DELETE FROM public.connection_events WHERE event_id=ev;
  DELETE FROM public.connection_notes WHERE event_id=ev;
  DELETE FROM public.connection_status_history WHERE connection_id IN (SELECT id FROM public.connections WHERE event_id=ev);
  DELETE FROM public.connections WHERE event_id=ev;
  DELETE FROM public.matches WHERE event_id=ev;
  DELETE FROM public.profile_needs WHERE event_id=ev;
  DELETE FROM public.profile_offers WHERE event_id=ev;
  DELETE FROM public.profile_segments WHERE profile_id IN (SELECT id FROM public.profiles WHERE event_id=ev);
  DELETE FROM public.consents WHERE event_id=ev;
  DELETE FROM public.analytics_events WHERE event_id=ev;
  DELETE FROM public.ai_runs WHERE event_id=ev;
  DELETE FROM public.audit_logs WHERE event_id=ev;
  DELETE FROM public.profiles WHERE event_id=ev;
  DELETE FROM public.taxonomy_items WHERE id IN (tx_social, tx_delivery);
  DELETE FROM public.events WHERE id=ev;
  DELETE FROM auth.users WHERE id IN (ua, ub);
END $$;