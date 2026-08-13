DO $$
DECLARE
  v_admin uuid; v_ev text := 'sudoexpo-2026'; v_seg text;
  v_id uuid; v_id2 uuid; v_json jsonb; v_n int; v_ok boolean;
  v_other uuid := gen_random_uuid();
BEGIN
  SELECT user_id INTO v_admin FROM public.event_staff WHERE event_id=v_ev AND role='admin' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'sem admin para o proof'; END IF;
  SELECT id INTO v_seg FROM public.segments ORDER BY sort_order LIMIT 1;

  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN PERFORM public.admin_list_taxonomy_items(v_ev); RAISE EXCEPTION 'FAIL N1';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role','authenticated')::text, true);
  BEGIN PERFORM public.admin_list_taxonomy_items(v_ev); RAISE EXCEPTION 'FAIL N2';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM public.admin_create_taxonomy_item(v_ev,'Teste X',v_seg,'both'); RAISE EXCEPTION 'FAIL N3';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated','is_anonymous',true)::text, true);
  BEGIN PERFORM public.admin_list_taxonomy_items(v_ev); RAISE EXCEPTION 'FAIL N4';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  BEGIN PERFORM public.admin_list_taxonomy_items('evento-inexistente-xyz'); RAISE EXCEPTION 'FAIL N5';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;

  BEGIN PERFORM public.admin_create_taxonomy_item(v_ev,'a',v_seg,'both'); RAISE EXCEPTION 'FAIL V1';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;
  BEGIN PERFORM public.admin_create_taxonomy_item(v_ev, repeat('x',121), v_seg,'both'); RAISE EXCEPTION 'FAIL V2';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;
  BEGIN PERFORM public.admin_create_taxonomy_item(v_ev,'Item ok','segmento-que-nao-existe','both'); RAISE EXCEPTION 'FAIL V3';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;
  BEGIN PERFORM public.admin_create_taxonomy_item(v_ev,'Item ok',v_seg,'invalido'); RAISE EXCEPTION 'FAIL V4';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;
  BEGIN PERFORM public.admin_create_taxonomy_item(v_ev,'Item ok',v_seg,'both', repeat('d',801)); RAISE EXCEPTION 'FAIL V5';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;

  v_id := public.admin_create_taxonomy_item(
    v_ev, '  Proof Impl11 Serviço  ', v_seg, 'both', '  desc  ',
    ARRAY['  PDV ','pdv','PdV','', '   ', repeat('y',81)] ||
    (SELECT array_agg('syn'||g) FROM generate_series(1,25) g)
  );
  SELECT to_jsonb(t) INTO v_json FROM public.taxonomy_items t WHERE id=v_id;
  IF v_json->>'label' <> 'Proof Impl11 Serviço' THEN RAISE EXCEPTION 'FAIL C1'; END IF;
  IF v_json->>'slug' <> 'proof-impl11-servico' THEN RAISE EXCEPTION 'FAIL C2 %', v_json->>'slug'; END IF;
  IF v_json->>'description' <> 'desc' THEN RAISE EXCEPTION 'FAIL C3'; END IF;
  SELECT array_length(synonyms,1) INTO v_n FROM public.taxonomy_items WHERE id=v_id;
  IF v_n <> 20 THEN RAISE EXCEPTION 'FAIL C4 %', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.taxonomy_items, unnest(synonyms) s WHERE id=v_id AND (s='' OR length(s)>80)) THEN
    RAISE EXCEPTION 'FAIL C5'; END IF;
  SELECT count(*) INTO v_n FROM public.taxonomy_items, unnest(synonyms) s WHERE id=v_id AND lower(s)='pdv';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL C6 %', v_n; END IF;

  v_id2 := public.admin_create_taxonomy_item(v_ev,'Proof Impl11 Serviço',v_seg,'both');
  IF (SELECT slug FROM public.taxonomy_items WHERE id=v_id2) <> 'proof-impl11-servico-2' THEN
    RAISE EXCEPTION 'FAIL C7 %', (SELECT slug FROM public.taxonomy_items WHERE id=v_id2); END IF;

  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE target_table='taxonomy_item' AND target_id=v_id::text AND action='create'
     AND event_id=v_ev AND actor_user_id=v_admin AND before IS NULL AND after->>'label'='Proof Impl11 Serviço';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL A1'; END IF;

  v_json := public.admin_update_taxonomy_item(v_ev, v_id, 'Proof Impl11 Renomeado', v_seg, 'need', NULL, ARRAY['novo']);
  IF (SELECT slug FROM public.taxonomy_items WHERE id=v_id) <> 'proof-impl11-servico' THEN RAISE EXCEPTION 'FAIL U1'; END IF;
  IF v_json->>'kind' <> 'need' OR v_json->>'label' <> 'Proof Impl11 Renomeado' THEN RAISE EXCEPTION 'FAIL U2'; END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs
   WHERE target_id=v_id::text AND action='update' AND before->>'label'='Proof Impl11 Serviço' AND after->>'label'='Proof Impl11 Renomeado';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL A2'; END IF;

  BEGIN PERFORM public.admin_update_taxonomy_item(v_ev, gen_random_uuid(), 'Nada', v_seg, 'both'); RAISE EXCEPTION 'FAIL U3';
  EXCEPTION WHEN sqlstate 'P0002' THEN NULL; END;
  BEGIN PERFORM public.admin_get_taxonomy_item_detail(v_ev, gen_random_uuid()); RAISE EXCEPTION 'FAIL D0';
  EXCEPTION WHEN sqlstate 'P0002' THEN NULL; END;

  v_json := public.admin_list_taxonomy_items(v_ev,'proof impl11',NULL,NULL,NULL,500,0);
  IF (v_json->>'limit')::int <> 100 THEN RAISE EXCEPTION 'FAIL L1'; END IF;
  IF (v_json->>'total')::int <> 2 THEN RAISE EXCEPTION 'FAIL L2 %', v_json->>'total'; END IF;
  IF (public.admin_list_taxonomy_items(v_ev,'novo')->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL L3'; END IF;
  IF (public.admin_list_taxonomy_items(v_ev,'proof impl11',NULL,ARRAY['need'])->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL L4'; END IF;
  IF (public.admin_list_taxonomy_items(v_ev,'proof impl11',ARRAY['nao-existe'])->>'total')::int <> 0 THEN RAISE EXCEPTION 'FAIL L5'; END IF;
  IF jsonb_array_length(public.admin_list_taxonomy_items(v_ev,'proof impl11',NULL,NULL,NULL,1,0)->'items') <> 1 THEN RAISE EXCEPTION 'FAIL L7'; END IF;

  PERFORM public.admin_set_taxonomy_item_active(v_ev, v_id, false);
  IF (SELECT active FROM public.taxonomy_items WHERE id=v_id) THEN RAISE EXCEPTION 'FAIL T1'; END IF;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(public.list_event_segments_and_taxonomy(v_ev)->'taxonomy') e
                 WHERE (e->>'id')::uuid = v_id) INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION 'FAIL T2'; END IF;
  IF (public.admin_list_taxonomy_items(v_ev,'proof impl11',NULL,NULL,false)->>'total')::int <> 1 THEN RAISE EXCEPTION 'FAIL T3'; END IF;
  PERFORM public.admin_set_taxonomy_item_active(v_ev, v_id, true);
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(public.list_event_segments_and_taxonomy(v_ev)->'taxonomy') e
                 WHERE (e->>'id')::uuid = v_id) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'FAIL T4'; END IF;
  SELECT count(*) INTO v_n FROM public.audit_logs WHERE target_id=v_id::text AND action IN ('activate','deactivate');
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL A3 %', v_n; END IF;

  v_json := public.admin_get_taxonomy_item_detail(v_ev, v_id);
  IF v_json->'item'->>'id' <> v_id::text THEN RAISE EXCEPTION 'FAIL D1'; END IF;
  IF jsonb_typeof(v_json->'relations') <> 'array' THEN RAISE EXCEPTION 'FAIL D2'; END IF;
  IF (v_json->'item'->>'usage_offers_total') IS NULL THEN RAISE EXCEPTION 'FAIL D3'; END IF;

  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.taxonomy_items'::regclass AND polcmd IN ('a','w','d')) THEN
    RAISE EXCEPTION 'FAIL P1'; END IF;
  IF has_table_privilege('authenticated','public.taxonomy_items','INSERT')
     OR has_table_privilege('authenticated','public.taxonomy_items','UPDATE')
     OR has_table_privilege('authenticated','public.taxonomy_items','DELETE') THEN
    RAISE EXCEPTION 'FAIL P2'; END IF;
  IF has_table_privilege('anon','public.taxonomy_items','SELECT') THEN RAISE EXCEPTION 'FAIL P3'; END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  DELETE FROM public.audit_logs WHERE target_table='taxonomy_item' AND target_id IN (v_id::text, v_id2::text);
  DELETE FROM public.taxonomy_items WHERE id IN (v_id, v_id2);

  RAISE NOTICE 'PROOF IMPL11 OK';
END $$;