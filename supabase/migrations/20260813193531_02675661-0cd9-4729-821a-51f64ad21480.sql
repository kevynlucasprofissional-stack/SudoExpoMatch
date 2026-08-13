DO $$
DECLARE
  ev text := 'proof-impl7';
  seg_a text := 'alimentacao';
  seg_m text := 'marketing';
  tx_buffet uuid;
  tx_social uuid;
  u uuid := gen_random_uuid();
  pid uuid;
  v_seg text;
  v_err text;
BEGIN
  -- Pré-condições: segmentos reais precisam existir
  IF NOT EXISTS (SELECT 1 FROM public.segments WHERE id=seg_a)
     OR NOT EXISTS (SELECT 1 FROM public.segments WHERE id=seg_m) THEN
    RAISE EXCEPTION 'IMPL7 SETUP: segmentos alimentacao/marketing ausentes';
  END IF;

  INSERT INTO public.events(id,name,city,is_active) VALUES (ev,'Proof IMPL7','Rio Verde',true);

  INSERT INTO public.taxonomy_items(slug,label,kind,segment_id,active)
  VALUES ('p7-buffet','P7 Buffet corporativo','both',seg_a,true) RETURNING id INTO tx_buffet;
  INSERT INTO public.taxonomy_items(slug,label,kind,segment_id,active)
  VALUES ('p7-social','P7 Gestao de redes sociais','both',seg_m,true) RETURNING id INTO tx_social;

  INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  VALUES (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'p7-'||u||'@proof.local','x',now(),now(),now());

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);

  -- 1) Payload cross-segment CORRETO é aceito
  pid := public.save_own_profile_v2(jsonb_build_object(
    'event_id',ev,'name','Ana','company','Restaurante P7','city','Rio Verde',
    'segment_id',seg_a,'summary','Restaurante familiar com buffet corporativo diario.',
    'consent',true,
    'offers',jsonb_build_array(jsonb_build_object(
      'label','P7 Buffet corporativo','segment_id',seg_a,'taxonomy_item_id',tx_buffet,'source','user')),
    'needs',jsonb_build_array(jsonb_build_object(
      'label','P7 Gestao de redes sociais','segment_id',seg_m,'taxonomy_item_id',tx_social,
      'need_kind','servico','is_priority',true,'source','ai'))
  ));
  IF pid IS NULL THEN RAISE EXCEPTION 'IMPL7 FAIL 1: payload cross-segment correto foi rejeitado'; END IF;

  -- 2) profile.segment_id continua o segmento da EMPRESA
  SELECT segment_id INTO v_seg FROM public.profiles WHERE id=pid;
  IF v_seg <> seg_a THEN RAISE EXCEPTION 'IMPL7 FAIL 2: profile.segment_id=% (esperado %)', v_seg, seg_a; END IF;

  -- 3) need usa o segmento da PRÓPRIA taxonomia (marketing)
  SELECT segment_id INTO v_seg FROM public.profile_needs WHERE profile_id=pid;
  IF v_seg <> seg_m THEN RAISE EXCEPTION 'IMPL7 FAIL 3: need.segment_id=% (esperado %)', v_seg, seg_m; END IF;

  -- 4) offer same-segment preservada
  SELECT segment_id INTO v_seg FROM public.profile_offers WHERE profile_id=pid;
  IF v_seg <> seg_a THEN RAISE EXCEPTION 'IMPL7 FAIL 4: offer.segment_id=% (esperado %)', v_seg, seg_a; END IF;

  -- 5) Mismatch (taxonomy item de marketing declarado como alimentacao) é REJEITADO
  BEGIN
    PERFORM public.save_own_profile_v2(jsonb_build_object(
      'event_id',ev,'name','Ana','company','Restaurante P7','city','Rio Verde',
      'segment_id',seg_a,'summary','Restaurante familiar com buffet corporativo diario.',
      'consent',true,
      'offers',jsonb_build_array(jsonb_build_object(
        'label','P7 Buffet corporativo','segment_id',seg_a,'taxonomy_item_id',tx_buffet,'source','user')),
      'needs',jsonb_build_array(jsonb_build_object(
        'label','P7 Gestao de redes sociais','segment_id',seg_a,'taxonomy_item_id',tx_social,
        'need_kind','servico','is_priority',true,'source','ai'))
    ));
    RAISE EXCEPTION 'IMPL7 FAIL 5: mismatch taxonomia/segmento foi aceito';
  EXCEPTION WHEN sqlstate '22023' THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'invalid_need_taxonomy' THEN
      RAISE EXCEPTION 'IMPL7 FAIL 5b: erro inesperado %', v_err;
    END IF;
  END;

  RESET role;
  PERFORM set_config('request.jwt.claims','',true);

  -- Limpeza total (sem resíduos)
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
  DELETE FROM public.taxonomy_items WHERE id IN (tx_buffet, tx_social);
  DELETE FROM public.events WHERE id=ev;
  DELETE FROM auth.users WHERE id=u;

  RAISE NOTICE 'IMPL7 OK: cross-segment aceito, mismatch rejeitado, sem residuos';
END $$;