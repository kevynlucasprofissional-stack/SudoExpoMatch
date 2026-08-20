ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_size text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS niche text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_business_size_check,
  DROP CONSTRAINT IF EXISTS profiles_business_type_check,
  DROP CONSTRAINT IF EXISTS profiles_niche_len_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_business_size_check
    CHECK (business_size IS NULL OR business_size IN ('pequeno','medio','grande')),
  ADD CONSTRAINT profiles_business_type_check
    CHECK (business_type IS NULL OR business_type IN ('comercio','industria','servico')),
  ADD CONSTRAINT profiles_niche_len_check
    CHECK (niche IS NULL OR length(niche) <= 120);

INSERT INTO public.segments(id, label, emoji, sort_order)
VALUES ('outros', 'Outros', '🧩', 99)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_own_profile_v2(_event_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_row public.profiles; v_out jsonb; v_consent boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.profiles
    WHERE event_id=_event_id AND owner_id=v_uid AND is_demo=false LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(cs.granted, false) INTO v_consent
    FROM public.consents cs
   WHERE cs.profile_id = v_row.id
     AND cs.event_id = _event_id
     AND cs.consent_type = 'matchmaking'
   ORDER BY cs.created_at DESC
   LIMIT 1;
  v_consent := COALESCE(v_consent, false);

  v_out := jsonb_build_object(
    'id', v_row.id, 'event_id', v_row.event_id, 'name', v_row.name,
    'company', v_row.company, 'city', v_row.city, 'neighborhood', v_row.neighborhood,
    'segment_id', v_row.segment_id, 'summary', v_row.summary, 'consent', v_consent,
    'business_size', v_row.business_size, 'business_type', v_row.business_type,
    'niche', v_row.niche,
    'created_at', v_row.created_at, 'updated_at', v_row.updated_at,
    'offers', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', po.id, 'taxonomy_item_id', po.taxonomy_item_id,
        'segment_id', po.segment_id, 'label', po.label, 'detail', po.detail
      ) ORDER BY po.sort_order),'[]'::jsonb)
      FROM public.profile_offers po WHERE po.profile_id=v_row.id AND po.active),
    'needs', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pn.id, 'taxonomy_item_id', pn.taxonomy_item_id,
        'segment_id', pn.segment_id, 'label', pn.label, 'detail', pn.detail,
        'need_kind', pn.need_kind, 'is_priority', pn.is_priority
      ) ORDER BY pn.sort_order),'[]'::jsonb)
      FROM public.profile_needs pn WHERE pn.profile_id=v_row.id AND pn.active)
  );
  RETURN v_out;
END $function$;

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
  v_business_size text := NULLIF(trim(COALESCE(_payload->>'business_size','')),'');
  v_business_type text := NULLIF(trim(COALESCE(_payload->>'business_type','')),'');
  v_niche text := NULLIF(trim(COALESCE(_payload->>'niche','')),'');
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
  IF v_business_size IS NOT NULL AND v_business_size NOT IN ('pequeno','medio','grande') THEN
    RAISE EXCEPTION 'invalid_business_size' USING ERRCODE='22023';
  END IF;
  IF v_business_type IS NOT NULL AND v_business_type NOT IN ('comercio','industria','servico') THEN
    RAISE EXCEPTION 'invalid_business_type' USING ERRCODE='22023';
  END IF;
  IF v_niche IS NOT NULL AND length(v_niche) > 120 THEN
    RAISE EXCEPTION 'invalid_niche' USING ERRCODE='22023';
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
      segment_id, summary, business_size, business_type, niche, is_demo)
    VALUES (v_uid, v_event, v_name, v_company, v_city, v_neighborhood,
      v_segment, v_summary, v_business_size, v_business_type, v_niche, false)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.profiles
       SET name=v_name, company=v_company, city=v_city, neighborhood=v_neighborhood,
           segment_id=v_segment, summary=v_summary,
           business_size=v_business_size, business_type=v_business_type, niche=v_niche,
           updated_at=now()
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

CREATE OR REPLACE FUNCTION public.admin_get_participant_detail(_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_p record;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.event_id, p.name, p.company, p.city, p.neighborhood,
         p.segment_id, p.summary, p.is_demo, p.created_at, p.updated_at,
         p.business_size, p.business_type, p.niche
    INTO v_p
    FROM public.profiles p
   WHERE p.id = _profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_event_role(v_p.event_id, v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_p.id,
      'event_id', v_p.event_id,
      'name', v_p.name,
      'company', v_p.company,
      'city', v_p.city,
      'neighborhood', v_p.neighborhood,
      'segment_id', v_p.segment_id,
      'segment_label', COALESCE((SELECT s.label FROM public.segments s WHERE s.id = v_p.segment_id), v_p.segment_id),
      'summary', v_p.summary,
      'business_size', v_p.business_size,
      'business_type', v_p.business_type,
      'niche', v_p.niche,
      'is_demo', v_p.is_demo,
      'created_at', v_p.created_at,
      'updated_at', v_p.updated_at
    ),
    'offers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'label', o.label, 'detail', o.detail,
        'segment_id', o.segment_id, 'taxonomy_item_id', o.taxonomy_item_id,
        'source', o.source, 'user_confirmed', o.user_confirmed,
        'active', o.active, 'sort_order', o.sort_order
      ) ORDER BY o.sort_order, o.created_at)
      FROM public.profile_offers o WHERE o.profile_id = v_p.id AND o.active
    ), '[]'::jsonb),
    'needs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'label', n.label, 'detail', n.detail,
        'segment_id', n.segment_id, 'taxonomy_item_id', n.taxonomy_item_id,
        'need_kind', n.need_kind, 'is_priority', n.is_priority,
        'source', n.source, 'user_confirmed', n.user_confirmed,
        'active', n.active, 'sort_order', n.sort_order
      ) ORDER BY n.is_priority DESC, n.sort_order, n.created_at)
      FROM public.profile_needs n WHERE n.profile_id = v_p.id AND n.active
    ), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'other_profile_id', x.other_id,
        'other_name', op.name,
        'other_company', op.company,
        'other_segment_id', op.segment_id,
        'kind', m.kind,
        'label', m.label,
        'score_for_participant', x.score_for_participant,
        'score_for_other', x.score_for_other,
        'label_for_participant', public.match_label_for_score(x.score_for_participant),
        'label_for_other', public.match_label_for_score(x.score_for_other),
        'decision_participant', COALESCE((
          SELECT d.decision::text FROM public.match_decisions d
           WHERE d.match_id = m.id AND d.profile_id = v_p.id
           ORDER BY d.decided_at DESC LIMIT 1
        ), 'sem_decisao'),
        'decision_other', COALESCE((
          SELECT d.decision::text FROM public.match_decisions d
           WHERE d.match_id = m.id AND d.profile_id = x.other_id
           ORDER BY d.decided_at DESC LIMIT 1
        ), 'sem_decisao'),
        'algorithm_version', m.algorithm_version,
        'generated_at', m.generated_at,
        'updated_at', m.updated_at
      ) ORDER BY x.score_for_participant DESC, m.generated_at DESC)
      FROM public.matches m
      CROSS JOIN LATERAL (
        SELECT
          CASE WHEN m.a_profile_id = v_p.id THEN m.b_profile_id ELSE m.a_profile_id END AS other_id,
          CASE WHEN m.a_profile_id = v_p.id THEN m.score_for_a ELSE m.score_for_b END AS score_for_participant,
          CASE WHEN m.a_profile_id = v_p.id THEN m.score_for_b ELSE m.score_for_a END AS score_for_other
      ) x
      JOIN public.profiles op ON op.id = x.other_id
     WHERE m.is_active AND (m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id)
    ), '[]'::jsonb),
    'connections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'match_id', c.match_id,
        'status', c.status,
        'other_profile_id', CASE WHEN c.a_profile_id = v_p.id THEN c.b_profile_id ELSE c.a_profile_id END,
        'other_name', op.name,
        'other_company', op.company,
        'assigned_to', c.assigned_to,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'completed_at', c.completed_at,
        'cancelled_at', c.cancelled_at
      ) ORDER BY c.created_at DESC)
      FROM public.connections c
      JOIN public.profiles op
        ON op.id = CASE WHEN c.a_profile_id = v_p.id THEN c.b_profile_id ELSE c.a_profile_id END
     WHERE c.a_profile_id = v_p.id OR c.b_profile_id = v_p.id
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(h ORDER BY (h->>'created_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'kind', 'connection',
          'action', ce.action,
          'previous_status', ce.previous_status,
          'new_status', ce.new_status,
          'created_at', ce.created_at
        ) AS h
          FROM public.connection_events ce
          JOIN public.connections c ON c.id = ce.connection_id
         WHERE c.a_profile_id = v_p.id OR c.b_profile_id = v_p.id
        UNION ALL
        SELECT jsonb_build_object(
          'kind', 'match',
          'action', msh.event_type,
          'previous_status', NULL,
          'new_status', NULL,
          'created_at', msh.created_at
        )
          FROM public.match_status_history msh
          JOIN public.matches m ON m.id = msh.match_id
         WHERE m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id
        ORDER BY 1 DESC
        LIMIT 100
      ) hist
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;