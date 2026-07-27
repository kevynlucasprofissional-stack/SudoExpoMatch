
-- =====================================================================
-- Entrega 1: Descoberta automática de matches
-- =====================================================================

-- Helper interno reutilizável: recalcula matches para 1 perfil.
-- Não usa auth.uid(). Sem execute público. Preserva simetria do par.
CREATE OR REPLACE FUNCTION public._recompute_matches_for_profile(
  p_profile_id uuid,
  p_event_id text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid;
  v_my_segment text;
  v_my_city text;
  v_my_updated_at timestamptz;
  v_other RECORD;
  v_pair_a uuid; v_pair_b uuid;
  v_score_me int; v_score_other int;
  v_reasons_me jsonb; v_reasons_other jsonb;
  v_kind public.match_kind;
  v_label public.match_label;
  v_signal boolean;
  v_match_id uuid;
  v_count int := 0;
  v_prio_covered boolean;
  v_overlap_offers_needs int;
  v_overlap_needs_offers int;
  v_now timestamptz := now();
BEGIN
  SELECT id, segment_id, city, updated_at
    INTO v_me, v_my_segment, v_my_city, v_my_updated_at
    FROM public.profiles
   WHERE id = p_profile_id AND event_id = p_event_id
   FOR UPDATE;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0001';
  END IF;

  -- Desativa apenas matches sem conexão associada (preserva histórico).
  UPDATE public.matches m
     SET is_active = false, updated_at = v_now
   WHERE m.event_id = p_event_id
     AND (m.a_profile_id = v_me OR m.b_profile_id = v_me)
     AND NOT EXISTS (SELECT 1 FROM public.connections c WHERE c.match_id = m.id);

  FOR v_other IN
    SELECT p.id, p.segment_id, p.city, p.updated_at, p.is_demo
      FROM public.profiles p
     WHERE p.event_id = p_event_id
       AND p.id <> v_me
       AND (
         p.is_demo = true
         OR EXISTS (
           SELECT 1 FROM public.consents cs
            WHERE cs.profile_id = p.id
              AND cs.event_id = p_event_id
              AND cs.consent_type = 'matchmaking'
              AND cs.granted = true
              AND cs.created_at = (
                SELECT max(cs2.created_at) FROM public.consents cs2
                 WHERE cs2.profile_id = p.id
                   AND cs2.event_id = p_event_id
                   AND cs2.consent_type = 'matchmaking'
              )
         )
       )
  LOOP
    SELECT COUNT(*)::int INTO v_overlap_offers_needs
      FROM public.profile_needs mn
      JOIN public.profile_offers oo ON oo.profile_id = v_other.id AND oo.active
     WHERE mn.profile_id = v_me AND mn.active
       AND public.taxonomy_match(mn.taxonomy_item_id, mn.label, oo.taxonomy_item_id, oo.label);

    SELECT COUNT(*)::int INTO v_overlap_needs_offers
      FROM public.profile_offers mo
      JOIN public.profile_needs no_ ON no_.profile_id = v_other.id AND no_.active
     WHERE mo.profile_id = v_me AND mo.active
       AND public.taxonomy_match(mo.taxonomy_item_id, mo.label, no_.taxonomy_item_id, no_.label);

    v_score_me := 0; v_reasons_me := '[]'::jsonb; v_signal := false;
    IF v_overlap_offers_needs > 0 THEN
      v_score_me := v_score_me + 55; v_signal := true;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','outro_oferece_o_que_procuro','weight',55,'label','O outro oferece o que você procura');
    END IF;
    IF v_overlap_needs_offers > 0 THEN
      v_score_me := v_score_me + 25; v_signal := true;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','outro_procura_o_que_ofereco','weight',25,'label','O outro procura o que você oferece');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.profile_needs mn
        JOIN public.profile_offers oo ON oo.profile_id=v_other.id AND oo.active
       WHERE mn.profile_id=v_me AND mn.is_priority AND mn.active
         AND public.taxonomy_match(mn.taxonomy_item_id, mn.label, oo.taxonomy_item_id, oo.label)
    ) INTO v_prio_covered;
    IF v_prio_covered THEN
      v_score_me := v_score_me + 10;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','prioridade','weight',10,'label','Atende sua necessidade prioritária');
    END IF;

    IF v_other.segment_id <> v_my_segment AND (v_overlap_offers_needs>0 OR v_overlap_needs_offers>0) THEN
      v_score_me := v_score_me + 5;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','complementaridade','weight',5,'label','Segmentos complementares');
    END IF;
    IF v_other.updated_at >= v_now - interval '7 days' THEN
      v_score_me := v_score_me + 3;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','atualidade','weight',3,'label','Perfil recém-atualizado');
    END IF;
    IF v_my_city <> '' AND public.norm_label(v_my_city) = public.norm_label(v_other.city) THEN
      v_score_me := v_score_me + 2;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','proximidade','weight',2,'label','Mesma cidade');
    END IF;

    v_score_other := 0; v_reasons_other := '[]'::jsonb;
    IF v_overlap_needs_offers > 0 THEN
      v_score_other := v_score_other + 55;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','outro_oferece_o_que_procuro','weight',55,'label','O outro oferece o que você procura');
    END IF;
    IF v_overlap_offers_needs > 0 THEN
      v_score_other := v_score_other + 25;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','outro_procura_o_que_ofereco','weight',25,'label','O outro procura o que você oferece');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.profile_needs no_
        JOIN public.profile_offers mo ON mo.profile_id=v_me AND mo.active
       WHERE no_.profile_id=v_other.id AND no_.is_priority AND no_.active
         AND public.taxonomy_match(no_.taxonomy_item_id, no_.label, mo.taxonomy_item_id, mo.label)
    ) INTO v_prio_covered;
    IF v_prio_covered THEN
      v_score_other := v_score_other + 10;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','prioridade','weight',10,'label','Atende necessidade prioritária do outro');
    END IF;

    IF v_other.segment_id <> v_my_segment AND (v_overlap_offers_needs>0 OR v_overlap_needs_offers>0) THEN
      v_score_other := v_score_other + 5;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','complementaridade','weight',5,'label','Segmentos complementares');
    END IF;
    IF v_my_updated_at >= v_now - interval '7 days' THEN
      v_score_other := v_score_other + 3;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','atualidade','weight',3,'label','Perfil recém-atualizado');
    END IF;
    IF v_my_city <> '' AND public.norm_label(v_my_city) = public.norm_label(v_other.city) THEN
      v_score_other := v_score_other + 2;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','proximidade','weight',2,'label','Mesma cidade');
    END IF;

    IF NOT v_signal THEN CONTINUE; END IF;

    IF v_overlap_offers_needs>0 AND v_overlap_needs_offers>0 THEN v_kind := 'bidirecional';
    ELSIF v_overlap_offers_needs>0 AND v_other.segment_id <> v_my_segment THEN v_kind := 'hibrido';
    ELSIF v_overlap_offers_needs>0 THEN v_kind := 'direto';
    ELSIF v_overlap_needs_offers>0 THEN v_kind := 'inverso';
    ELSE v_kind := 'complementar';
    END IF;

    IF GREATEST(v_score_me, v_score_other) >= 75 THEN v_label := 'alta_compatibilidade';
    ELSIF GREATEST(v_score_me, v_score_other) >= 40 THEN v_label := 'boa_oportunidade';
    ELSE v_label := 'conexao_possivel';
    END IF;

    IF v_me < v_other.id THEN
      v_pair_a := v_me; v_pair_b := v_other.id;
    ELSE
      v_pair_a := v_other.id; v_pair_b := v_me;
    END IF;

    INSERT INTO public.matches (event_id, a_profile_id, b_profile_id, kind,
      score_for_a, score_for_b, label, reasons_for_a, reasons_for_b,
      algorithm_version, is_active, generated_at)
    VALUES (p_event_id, v_pair_a, v_pair_b, v_kind,
      CASE WHEN v_pair_a = v_me THEN v_score_me ELSE v_score_other END,
      CASE WHEN v_pair_b = v_me THEN v_score_me ELSE v_score_other END,
      v_label,
      CASE WHEN v_pair_a = v_me THEN v_reasons_me ELSE v_reasons_other END,
      CASE WHEN v_pair_b = v_me THEN v_reasons_me ELSE v_reasons_other END,
      'v2.1', true, v_now)
    ON CONFLICT (event_id, a_profile_id, b_profile_id) DO UPDATE
      SET kind = EXCLUDED.kind,
          score_for_a = EXCLUDED.score_for_a,
          score_for_b = EXCLUDED.score_for_b,
          label = EXCLUDED.label,
          reasons_for_a = EXCLUDED.reasons_for_a,
          reasons_for_b = EXCLUDED.reasons_for_b,
          is_active = true,
          generated_at = v_now,
          algorithm_version = 'v2.1',
          updated_at = v_now
    RETURNING id INTO v_match_id;

    DELETE FROM public.match_reasons WHERE match_id = v_match_id;
    INSERT INTO public.match_reasons (match_id, perspective_profile_id, code, label, weight)
    SELECT v_match_id, v_me, r->>'code', r->>'label', COALESCE((r->>'weight')::int,0)
      FROM jsonb_array_elements(v_reasons_me) r;
    INSERT INTO public.match_reasons (match_id, perspective_profile_id, code, label, weight)
    SELECT v_match_id, v_other.id, r->>'code', r->>'label', COALESCE((r->>'weight')::int,0)
      FROM jsonb_array_elements(v_reasons_other) r;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;

REVOKE ALL ON FUNCTION public._recompute_matches_for_profile(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._recompute_matches_for_profile(uuid, text) TO service_role;

-- RPC pública: apenas resolve o perfil do caller e delega.
CREATE OR REPLACE FUNCTION public.recompute_own_matches(_event_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_me uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_me FROM public.profiles
    WHERE event_id = _event_id AND owner_id = v_uid AND is_demo = false;
  IF v_me IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0001'; END IF;
  RETURN public._recompute_matches_for_profile(v_me, _event_id);
END $function$;

-- save_own_profile_v2: dispara recompute automático na mesma transação.
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
  v_label text; v_detail text; v_tax uuid; v_seg text; v_need_kind text;
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
    INSERT INTO public.profile_offers(profile_id, event_id, segment_id, taxonomy_item_id,
      text, label, detail, sort_order, source, user_confirmed, active)
    VALUES (v_id, v_event,
      COALESCE(NULLIF(v_item->>'segment_id',''), v_segment),
      NULLIF(v_item->>'taxonomy_item_id','')::uuid,
      v_label, v_label, v_detail, v_idx, 'user', true, true);
    v_idx := v_idx + 1;
  END LOOP;

  DELETE FROM public.profile_needs WHERE profile_id = v_id;
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_needs) LOOP
    v_label := trim(v_item->>'label');
    v_detail := NULLIF(trim(COALESCE(v_item->>'detail','')),'');
    INSERT INTO public.profile_needs(profile_id, event_id, segment_id, taxonomy_item_id,
      text, label, detail, need_kind, is_priority, sort_order, source, user_confirmed, active)
    VALUES (v_id, v_event,
      COALESCE(NULLIF(v_item->>'segment_id',''), v_segment),
      NULLIF(v_item->>'taxonomy_item_id','')::uuid,
      v_label, v_label, v_detail,
      COALESCE(NULLIF(v_item->>'need_kind',''),'outro'),
      (v_idx = v_forced_priority),
      v_idx, 'user', true, true);
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

  -- Recálculo automático na mesma transação. Falha aborta o save (atomicidade).
  PERFORM public._recompute_matches_for_profile(v_id, v_event);

  RETURN v_id;
END $function$;
