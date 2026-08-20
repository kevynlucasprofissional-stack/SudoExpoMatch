DO $t$
DECLARE
  v_ev text := 'map-ev-1'; v_ev2 text := 'map-ev-2';
  v_staff uuid := gen_random_uuid(); v_admin uuid := gen_random_uuid(); v_out uuid := gen_random_uuid();
  v_pa uuid := gen_random_uuid(); v_pb uuid := gen_random_uuid();
  v_m uuid := gen_random_uuid(); v_c uuid;
  v_r jsonb;
  v_ok text := '';
  v_n int;
BEGIN
  INSERT INTO public.events(id,name,city,is_active) VALUES (v_ev,'M1','X',true),(v_ev2,'M2','X',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u.id::text||'@map.test','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb
  FROM (VALUES (v_staff),(v_admin),(v_out)) u(id);
  INSERT INTO public.event_staff(event_id,user_id,role) VALUES (v_ev,v_staff,'staff'),(v_ev,v_admin,'admin'),(v_ev2,v_out,'staff');
  INSERT INTO public.profiles(id,event_id,name,company,city,whatsapp,segment_id,summary,offers,needs,consent,is_demo,recovery_code)
  VALUES (v_pa,v_ev,'A','CA','X','551','servicos','sa','[]','[]',true,true,'r1'),
         (v_pb,v_ev,'B','CB','X','552','servicos','sb','[]','[]',true,true,'r2');
  INSERT INTO public.matches(id,event_id,a_profile_id,b_profile_id,kind,score_for_a,score_for_b,label,reasons_for_a,reasons_for_b,algorithm_version)
  VALUES (v_m,v_ev,v_pa,v_pb,'direto',80,80,'alta_compatibilidade','[]','[]','test');
  INSERT INTO public.connections(match_id,event_id,a_profile_id,b_profile_id,status)
  VALUES (v_m,v_ev,v_pa,v_pb,'aguardando') RETURNING id INTO v_c;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',v_staff,'role','authenticated')::text);

  v_r := public.staff_set_participant_pin(v_pa,'A12');
  IF (v_r->>'changed')::boolean AND (v_r->>'pin_code')='A12' THEN v_ok := v_ok||'ok pin marcado; '; ELSE v_ok := v_ok||'FALHA pin marcado; '; END IF;
  v_r := public.staff_set_participant_pin(v_pa,'A12');
  IF (v_r->>'changed')::boolean IS FALSE THEN v_ok := v_ok||'ok pin idempotente; '; ELSE v_ok := v_ok||'FALHA pin idempotente; '; END IF;
  v_r := public.staff_set_participant_pin(v_pa,'A13');
  IF (v_r->>'pin_code')='A13' THEN v_ok := v_ok||'ok pin corrigido; '; ELSE v_ok := v_ok||'FALHA pin corrigido; '; END IF;
  BEGIN PERFORM public.staff_set_participant_pin(v_pb,'a13'); v_ok := v_ok||'FALHA duplicado aceito; ';
  EXCEPTION WHEN sqlstate '23505' THEN v_ok := v_ok||'ok duplicado bloqueado; '; END;
  v_r := public.staff_set_participant_pin(v_pb,'B01');
  BEGIN PERFORM public.staff_set_participant_pin(gen_random_uuid(),'ZZ'); v_ok := v_ok||'FALHA perfil inexistente; ';
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := v_ok||'ok perfil inexistente; '; END;

  BEGIN PERFORM public.staff_mark_connection_mapped(v_c); v_ok := v_ok||'FALHA mapeou antes de apresentar; ';
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := v_ok||'ok exige apresentados; '; END;

  PERFORM public.staff_assume_connection(v_c);
  PERFORM public.staff_advance_connection(v_c,'apresentados',NULL);

  v_r := public.staff_mark_connection_mapped(v_c,'pins ligados no painel');
  IF (v_r->>'changed')::boolean THEN v_ok := v_ok||'ok registro fisico; '; ELSE v_ok := v_ok||'FALHA registro fisico; '; END IF;
  v_r := public.staff_mark_connection_mapped(v_c);
  IF (v_r->>'changed')::boolean IS FALSE THEN v_ok := v_ok||'ok mapa idempotente; '; ELSE v_ok := v_ok||'FALHA mapa idempotente; '; END IF;

  BEGIN PERFORM public.staff_mark_connection_mapped(gen_random_uuid()); v_ok := v_ok||'FALHA conexao inexistente; ';
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := v_ok||'ok conexao inexistente; '; END;

  IF ((public.staff_list_connections_v2(v_ev,NULL,NULL,NULL,'mapped'))->>'total')::int = 1
     AND ((public.staff_list_connections_v2(v_ev,NULL,NULL,NULL,'map_pending'))->>'total')::int = 0
  THEN v_ok := v_ok||'ok escopos mapa; '; ELSE v_ok := v_ok||'FALHA escopos mapa; '; END IF;
  IF ((public.staff_list_connections_v2(v_ev))->'items'->0->>'a_pin_code') = 'A13'
  THEN v_ok := v_ok||'ok pin na fila; '; ELSE v_ok := v_ok||'FALHA pin na fila; '; END IF;
  IF ((public.staff_list_pins(v_ev,NULL,true))->>'total')::int = 0
     AND ((public.staff_list_pins(v_ev))->>'pins_placed')::int = 2
  THEN v_ok := v_ok||'ok lista de pins; '; ELSE v_ok := v_ok||'FALHA lista de pins; '; END IF;

  v_r := public.staff_unmark_connection_mapped(v_c,'corrigindo painel');
  IF (v_r->>'changed')::boolean THEN v_ok := v_ok||'ok desfazer mapa; '; ELSE v_ok := v_ok||'FALHA desfazer mapa; '; END IF;
  IF ((public.staff_list_connections_v2(v_ev,NULL,NULL,NULL,'map_pending'))->>'total')::int = 1
  THEN v_ok := v_ok||'ok volta para pendente; '; ELSE v_ok := v_ok||'FALHA volta pendente; '; END IF;
  PERFORM public.staff_mark_connection_mapped(v_c);

  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',v_out,'role','authenticated')::text);
  BEGIN PERFORM public.staff_set_participant_pin(v_pa,'X9'); v_ok := v_ok||'FALHA staff externo pin; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok staff externo bloqueado(pin); '; END;
  BEGIN PERFORM public.staff_mark_connection_mapped(v_c); v_ok := v_ok||'FALHA staff externo mapa; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok staff externo bloqueado(mapa); '; END;
  BEGIN PERFORM public.staff_list_pins(v_ev); v_ok := v_ok||'FALHA staff externo lista; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok staff externo bloqueado(lista); '; END;

  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',v_admin,'role','authenticated')::text);
  v_r := public.staff_unmark_connection_mapped(v_c,'ajuste admin');
  IF (v_r->>'changed')::boolean THEN v_ok := v_ok||'ok admin desfaz; '; ELSE v_ok := v_ok||'FALHA admin desfaz; '; END IF;
  v_r := public.staff_clear_participant_pin(v_pb,'pin caiu');
  IF (v_r->>'changed')::boolean THEN v_ok := v_ok||'ok pin removido; '; ELSE v_ok := v_ok||'FALHA pin removido; '; END IF;
  v_r := public.staff_clear_participant_pin(v_pb);
  IF (v_r->>'changed')::boolean IS FALSE THEN v_ok := v_ok||'ok remover idempotente; '; ELSE v_ok := v_ok||'FALHA remover idempotente; '; END IF;

  RESET role;

  SELECT count(*) INTO v_n FROM public.connection_events WHERE connection_id=v_c AND action IN ('map_linked','map_unlinked');
  IF v_n = 4 THEN v_ok := v_ok||'ok historico conexao(4); '; ELSE v_ok := v_ok||format('FALHA historico conexao(%s); ',v_n); END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs WHERE event_id=v_ev AND action LIKE 'pin_%';
  IF v_n = 4 THEN v_ok := v_ok||'ok auditoria pin(4); '; ELSE v_ok := v_ok||format('FALHA auditoria pin(%s); ',v_n); END IF;

  IF v_ok LIKE '%FALHA%' THEN RAISE EXCEPTION 'PROVA MAPA: %', v_ok; END IF;
  RAISE NOTICE 'PROVA MAPA OK: %', v_ok;

  DELETE FROM public.audit_logs WHERE event_id IN (v_ev,v_ev2);
  DELETE FROM public.connection_events WHERE event_id IN (v_ev,v_ev2);
  DELETE FROM public.connection_status_history WHERE connection_id = v_c;
  DELETE FROM public.connections WHERE event_id IN (v_ev,v_ev2);
  DELETE FROM public.match_reasons WHERE match_id = v_m;
  DELETE FROM public.matches WHERE event_id IN (v_ev,v_ev2);
  DELETE FROM public.profiles WHERE event_id IN (v_ev,v_ev2);
  DELETE FROM public.event_staff WHERE event_id IN (v_ev,v_ev2);
  DELETE FROM auth.users WHERE id IN (v_staff,v_admin,v_out);
  DELETE FROM public.events WHERE id IN (v_ev,v_ev2);
END $t$;