DO $t$
DECLARE
  v_ev text := 'aud-ev-1'; v_ev2 text := 'aud-ev-2';
  v_admin uuid := gen_random_uuid(); v_staff uuid := gen_random_uuid(); v_user uuid := gen_random_uuid(); v_admin2 uuid := gen_random_uuid();
  v_p uuid := gen_random_uuid(); v_ok text := '';
BEGIN
  INSERT INTO public.events(id,name,city,is_active) VALUES (v_ev,'A','X',true),(v_ev2,'B','X',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u.id::text||'@aud.test','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb
  FROM (VALUES (v_admin),(v_staff),(v_user),(v_admin2)) u(id);
  INSERT INTO public.event_staff(event_id,user_id,role) VALUES (v_ev,v_admin,'admin'),(v_ev,v_staff,'staff'),(v_ev2,v_admin2,'admin');
  INSERT INTO public.profiles(id,event_id,name,company,city,whatsapp,segment_id,summary,offers,needs,consent,is_demo,recovery_code)
    VALUES (v_p,v_ev,'P','C','X','5599','servicos','s','[]','[]',true,true,'x');

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',v_staff,'role','authenticated')::text);
  BEGIN PERFORM public.admin_list_participants(v_ev,NULL,NULL,NULL,10,0); v_ok := v_ok||'FALHA staff->participants; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok staff bloqueado(participants); '; END;
  BEGIN PERFORM public.admin_list_matches(v_ev); v_ok := v_ok||'FALHA staff->matches; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok staff bloqueado(matches); '; END;
  BEGIN PERFORM public.admin_list_taxonomy_items(v_ev); v_ok := v_ok||'FALHA staff->taxonomia; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok staff bloqueado(taxonomia); '; END;
  BEGIN PERFORM public.admin_create_taxonomy_item(v_ev,'X aud','servicos','both',NULL,ARRAY[]::text[]); v_ok := v_ok||'FALHA staff->create item; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok staff bloqueado(create item); '; END;

  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',v_admin2,'role','authenticated')::text);
  BEGIN PERFORM public.admin_list_participants(v_ev,NULL,NULL,NULL,10,0); v_ok := v_ok||'FALHA admin2->ev1; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok isolamento evento; '; END;
  BEGIN PERFORM public.admin_get_participant_detail(v_p); v_ok := v_ok||'FALHA admin2->detalhe; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok isolamento detalhe; '; END;

  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',v_user,'role','authenticated')::text);
  BEGIN PERFORM public.admin_get_participant_detail(v_p); v_ok := v_ok||'FALHA user->detalhe; ';
  EXCEPTION WHEN sqlstate '42501' THEN v_ok := v_ok||'ok user bloqueado; '; END;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=v_p) THEN v_ok := v_ok||'FALHA RLS profiles vazando; '; ELSE v_ok := v_ok||'ok RLS profiles; '; END IF;

  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub',v_admin,'role','authenticated')::text);
  IF (public.admin_get_participant_detail(v_p))::text ILIKE '%5599%' THEN v_ok := v_ok||'FALHA PII na RPC admin; '; ELSE v_ok := v_ok||'ok sem PII; '; END IF;
  RESET role;

  IF v_ok LIKE '%FALHA%' THEN RAISE EXCEPTION 'AUDITORIA: %', v_ok; END IF;
  RAISE NOTICE 'AUDITORIA OK: %', v_ok;

  DELETE FROM public.audit_logs WHERE event_id IN (v_ev,v_ev2);
  DELETE FROM public.profiles WHERE event_id=v_ev;
  DELETE FROM public.event_staff WHERE event_id IN (v_ev,v_ev2);
  DELETE FROM auth.users WHERE id IN (v_admin,v_staff,v_user,v_admin2);
  DELETE FROM public.events WHERE id IN (v_ev,v_ev2);
END $t$;