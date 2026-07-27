CREATE OR REPLACE FUNCTION public.save_own_profile_v2(_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event text := _payload->>'event_id';
  v_name text := trim(_payload->>'name');
  v_company text := trim(_payload->>'company');
  v_city text := trim(_payload->>'city');
  v_neighborhood text := _payload->>'neighborhood';
  v_segment text := _payload->>'segment_id';
  v_summary text := trim(_payload->>'summary');
  v_consent boolean := COALESCE((_payload->>'consent')::boolean, false);
  v_policy_version text := COALESCE(_payload->>'policy_version','1');
  v_offers jsonb := COALESCE(_payload->'offers','[]'::jsonb);
  v_needs  jsonb := COALESCE(_payload->'needs','[]'::jsonb);
  v_id uuid;
  v_item jsonb;
  v_idx int;
  v_off_count int;
  v_need_count int;
  v_priority_count int := 0;
  v_forced_priority int := -1;
  v_label text; v_detail text; v_tax uuid; v_seg text; v_need_kind text; v_source text;
  v_labels_seen text[];
  v_lbl_norm text;
  v_last_consent RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id=v_event AND is_active) THEN
    RAISE EXCEPTION 'event_not_active' USING ERRCODE='P0001';
  END IF;
  IF v_consent IS NOT TRUE THEN RAISE EXCEPTION 'consent_required' USING ERRCODE='P0001'; END IF;
  IF coalesce(v_name,'')='' OR coalesce(v_company,'')='' OR coalesce(v_city,'')=''
     OR coalesce(v_segment,'')='' OR coalesce(v_summary,'')='' THEN
    RAISE EXCEPTION 'missing_fields' USING ERRCODE='22023';
  END IF;
  IF length(v_name)>120 OR length(v_company)>160 OR length(v_summary)>800 THEN
    RAISE EXCEPTION 'field_too_long' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.segments WHERE id=v_segment) THEN
    RAISE EXCEPTION 'invalid_segment' USING ERRCODE='22023';
  END IF;

  v_off_count := jsonb_array_length(v_offers);
  v_need_count := jsonb_array_length(v_needs);
  IF v_off_count < 1 OR v_off_count > 5 THEN RAISE EXCEPTION 'invalid_offers_count' USING ERRCODE='22023'; END IF;
  IF v_need_count < 1 OR v_need_count > 5 THEN RAISE EXCEPTION 'invalid_needs_count' USING ERRCODE='22023'; END IF;

  v_labels_seen := ARRAY[]::text[];
  FOR v_idx IN 0 .. v_off_count-1 LOOP
    v_item := v_offers->v_idx;
    v_label := COALESCE(trim(v_item->>'label'),'');
    v_detail := NULLIF(trim(COALESCE(v_item->>'detail','')),'');
    v_tax := NULLIF(v_item->>'taxonomy_item_id','')::uuid;
    v_seg := COALESCE(NULLIF(v_item->>'segment_id',''), v_segment);
    v_source := COALESCE(NULLIF(v_item->>'source',''),'user');
    IF v_source NOT IN ('user','ai','heuristic') THEN
      RAISE EXCEPTION 'invalid_source' USING ERRCODE='22023';
    END IF;
    IF length(v_label) < 2 OR length(v_label) > 120 THEN
      RAISE EXCEPTION 'invalid_offer_label' USING ERRCODE='22023';
    END IF;
    IF v_detail IS NOT NULL AND length(v_detail) > 300 THEN
      RAISE EXCEPTION 'invalid_offer_detail' USING ERRCODE='22023';
    END IF;
    IF v_tax IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.taxonomy_items ti
         WHERE ti.id=v_tax AND ti.active=true AND ti.segment_id=v_seg
           AND ti.kind IN ('offer','both')
      ) THEN
        RAISE EXCEPTION 'invalid_offer_taxonomy' USING ERRCODE='22023';
      END IF;
    END IF;
    v_lbl_norm := public.norm_label(v_label);
    IF v_lbl_norm = ANY(v_labels_seen) THEN
      RAISE EXCEPTION 'duplicate_offer_label' USING ERRCODE='22023';
    END IF;
    v_labels_seen := array_append(v_labels_seen, v_lbl_norm);
  END LOOP;

  v_labels_seen := ARRAY[]::text[];
  FOR v_idx IN 0 .. v_need_count-1 LOOP
    v_item := v_needs->v_idx;
    v_label := COALESCE(trim(v_item->>'label'),'');
    v_detail := NULLIF(trim(COALESCE(v_item->>'detail','')),'');
    v_tax := NULLIF(v_item->>'taxonomy_item_id','')::uuid;
    v_seg := COALESCE(NULLIF(v_item->>'segment_id',''), v_segment);
    v_need_kind := COALESCE(NULLIF(v_item->>'need_kind',''),'outro');
    v_source := COALESCE(NULLIF(v_item->>'source',''),'user');
    IF v_source NOT IN ('user','ai','heuristic') THEN
      RAISE EXCEPTION 'invalid_source' USING ERRCODE='22023';
    END IF;
    IF length(v_label) < 2 OR length(v_label) > 120 THEN
      RAISE EXCEPTION 'invalid_need_label' USING ERRCODE='22023';
    END IF;
    IF v_detail IS NOT NULL AND length(v_detail) > 300 THEN
      RAISE EXCEPTION 'invalid_need_detail' USING ERRCODE='22023';
    END IF;
    IF v_need_kind NOT IN ('servico','fornecedor','parceiro','compradores','distribuidores','profissionais','produtos','outro') THEN
      RAISE EXCEPTION 'invalid_need_kind' USING ERRCODE='22023';
    END IF;
    IF v_tax IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.taxonomy_items ti
         WHERE ti.id=v_tax AND ti.active=true AND ti.segment_id=v_seg
           AND ti.kind IN ('need','both')
      ) THEN
        RAISE EXCEPTION 'invalid_need_taxonomy' USING ERRCODE='22023';
      END IF;
    END IF;
    v_lbl_norm := public.norm_label(v_label);
    IF v_lbl_norm = ANY(v_labels_seen) THEN
      RAISE EXCEPTION 'duplicate_need_label' USING ERRCODE='22023';
    END IF;
    v_labels_seen := array_append(v_labels_seen, v_lbl_norm);
    IF COALESCE((v_item->>'is_priority')::boolean, false) THEN
      v_priority_count := v_priority_count + 1;
      IF v_forced_priority < 0 THEN v_forced_priority := v_idx; END IF;
    END IF;
  END LOOP;
  IF v_priority_count = 0 THEN v_forced_priority := 0; END IF;

  SELECT id INTO v_id FROM public.profiles
   WHERE event_id=v_event AND owner_id=v_uid AND is_demo=false FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.profiles(owner_id, event_id, name, company, city, neighborhood,
      whatsapp, segment_id, summary, offers, needs, consent, is_demo, recovery_code)
    VALUES (v_uid, v_event, v_name, v_company, v_city, v_neighborhood,
      '', v_segment, v_summary, '[]'::jsonb, '[]'::jsonb, true, false, '')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.profiles
       SET name=v_name, company=v_company, city=v_city, neighborhood=v_neighborhood,
           segment_id=v_segment, summary=v_summary, consent=true, updated_at=now()
     WHERE id=v_id;
  END IF;

  DELETE FROM public.profile_segments WHERE profile_id = v_id;
  INSERT INTO public.profile_segments(profile_id, segment_id, is_primary)
  VALUES (v_id, v_segment, true);

  DELETE FROM public.profile_offers WHERE profile_id = v_id;
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_offers) LOOP
    v_label := trim(v_item->>'label');
    v_detail := NULLIF(trim(COALESCE(v_item->>'detail','')),'');
    v_source := COALESCE(NULLIF(v_item->>'source',''),'user');
    INSERT INTO public.profile_offers(profile_id, event_id, segment_id, taxonomy_item_id,
      text, label, detail, sort_order, source, user_confirmed, active)
    VALUES (v_id, v_event,
      COALESCE(NULLIF(v_item->>'segment_id',''), v_segment),
      NULLIF(v_item->>'taxonomy_item_id','')::uuid,
      v_label, v_label, v_detail, v_idx, v_source, true, true);
    v_idx := v_idx + 1;
  END LOOP;

  DELETE FROM public.profile_needs WHERE profile_id = v_id;
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_needs) LOOP
    v_label := trim(v_item->>'label');
    v_detail := NULLIF(trim(COALESCE(v_item->>'detail','')),'');
    v_source := COALESCE(NULLIF(v_item->>'source',''),'user');
    INSERT INTO public.profile_needs(profile_id, event_id, segment_id, taxonomy_item_id,
      text, label, detail, need_kind, is_priority, sort_order, source, user_confirmed, active)
    VALUES (v_id, v_event,
      COALESCE(NULLIF(v_item->>'segment_id',''), v_segment),
      NULLIF(v_item->>'taxonomy_item_id','')::uuid,
      v_label, v_label, v_detail,
      COALESCE(NULLIF(v_item->>'need_kind',''),'outro'),
      (v_idx = v_forced_priority),
      v_idx, v_source, true, true);
    v_idx := v_idx + 1;
  END LOOP;

  SELECT * INTO v_last_consent FROM public.consents
   WHERE profile_id=v_id AND event_id=v_event AND consent_type='matchmaking'
   ORDER BY created_at DESC LIMIT 1;
  IF v_last_consent IS NULL
     OR v_last_consent.version <> v_policy_version
     OR v_last_consent.granted IS DISTINCT FROM true THEN
    INSERT INTO public.consents(profile_id, event_id, consent_type, version, granted)
    VALUES (v_id, v_event, 'matchmaking', v_policy_version, true);
  END IF;

  PERFORM public._recompute_matches_for_profile(v_id, v_event);

  RETURN v_id;
END $function$;