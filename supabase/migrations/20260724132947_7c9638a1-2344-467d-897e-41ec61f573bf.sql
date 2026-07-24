
-- =====================================================================
-- 1) UNIQUE constraint em matches: (event_id, a_profile_id, b_profile_id)
-- =====================================================================
-- Não existem linhas atualmente, então a migração é segura. Ainda assim,
-- validamos duplicidades antes:
DO $$
DECLARE
  v_dups int;
BEGIN
  SELECT count(*) INTO v_dups FROM (
    SELECT event_id, a_profile_id, b_profile_id, count(*) c
      FROM public.matches
     GROUP BY 1,2,3 HAVING count(*) > 1
  ) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'duplicates_found_before_unique_migration: %', v_dups;
  END IF;
END $$;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_a_profile_id_b_profile_id_key;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_event_pair_uidx UNIQUE (event_id, a_profile_id, b_profile_id);

-- =====================================================================
-- 2) Helper de similaridade taxonômica (sinônimos + substring segura)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.taxonomy_match(
  _a_tax uuid, _a_label text, _b_tax uuid, _b_label text
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  WITH
    a AS (SELECT public.norm_label(_a_label) AS lbl),
    b AS (SELECT public.norm_label(_b_label) AS lbl),
    a_syn AS (
      SELECT unnest(coalesce(ti.synonyms,'{}'::text[])) AS s
        FROM public.taxonomy_items ti WHERE ti.id = _a_tax
    ),
    b_syn AS (
      SELECT unnest(coalesce(ti.synonyms,'{}'::text[])) AS s
        FROM public.taxonomy_items ti WHERE ti.id = _b_tax
    )
  SELECT
    -- mesmo item de taxonomia
    (_a_tax IS NOT NULL AND _a_tax = _b_tax)
    -- labels normalizados iguais
    OR ((SELECT lbl FROM a) = (SELECT lbl FROM b) AND (SELECT lbl FROM a) <> '')
    -- label do lado A aparece nos sinônimos do lado B
    OR EXISTS (SELECT 1 FROM b_syn WHERE public.norm_label(s) = (SELECT lbl FROM a) AND (SELECT lbl FROM a) <> '')
    -- label do lado B aparece nos sinônimos do lado A
    OR EXISTS (SELECT 1 FROM a_syn WHERE public.norm_label(s) = (SELECT lbl FROM b) AND (SELECT lbl FROM b) <> '')
    -- substring apenas para termos com >=4 chars em ambos os lados
    OR (
      length((SELECT lbl FROM a)) >= 4 AND length((SELECT lbl FROM b)) >= 4 AND (
        position((SELECT lbl FROM a) in (SELECT lbl FROM b)) > 0
        OR position((SELECT lbl FROM b) in (SELECT lbl FROM a)) > 0
      )
    );
$$;

-- =====================================================================
-- 3) recompute_own_matches: consentimento por `consents`, atualidade do outro
--    baseada no MEU perfil, helper de taxonomia, preserva matches com conexão
-- =====================================================================
CREATE OR REPLACE FUNCTION public.recompute_own_matches(_event_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT id, segment_id, city, updated_at
    INTO v_me, v_my_segment, v_my_city, v_my_updated_at
    FROM public.profiles
   WHERE event_id=_event_id AND owner_id=v_uid AND is_demo=false
   FOR UPDATE;
  IF v_me IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0001'; END IF;

  -- Desativa somente matches SEM conexão associada. Matches com conexão
  -- (ativa ou concluída) são preservados como histórico consultável.
  UPDATE public.matches m
     SET is_active = false, updated_at = v_now
   WHERE m.event_id = _event_id
     AND (m.a_profile_id = v_me OR m.b_profile_id = v_me)
     AND NOT EXISTS (SELECT 1 FROM public.connections c WHERE c.match_id = m.id);

  FOR v_other IN
    SELECT p.id, p.segment_id, p.city, p.updated_at, p.is_demo
      FROM public.profiles p
     WHERE p.event_id = _event_id
       AND p.id <> v_me
       AND (
         p.is_demo = true
         OR EXISTS (
           SELECT 1 FROM public.consents cs
            WHERE cs.profile_id = p.id
              AND cs.event_id = _event_id
              AND cs.consent_type = 'matchmaking'
              AND cs.granted = true
              AND cs.created_at = (
                SELECT max(cs2.created_at) FROM public.consents cs2
                 WHERE cs2.profile_id = p.id
                   AND cs2.event_id = _event_id
                   AND cs2.consent_type = 'matchmaking'
              )
         )
       )
  LOOP
    -- overlap "outro oferece o que eu preciso"
    SELECT COUNT(*)::int INTO v_overlap_offers_needs
      FROM public.profile_needs mn
      JOIN public.profile_offers oo ON oo.profile_id = v_other.id AND oo.active
     WHERE mn.profile_id = v_me AND mn.active
       AND public.taxonomy_match(mn.taxonomy_item_id, mn.label, oo.taxonomy_item_id, oo.label);

    -- overlap "outro precisa do que eu ofereço"
    SELECT COUNT(*)::int INTO v_overlap_needs_offers
      FROM public.profile_offers mo
      JOIN public.profile_needs no_ ON no_.profile_id = v_other.id AND no_.active
     WHERE mo.profile_id = v_me AND mo.active
       AND public.taxonomy_match(mo.taxonomy_item_id, mo.label, no_.taxonomy_item_id, no_.label);

    -- Perspectiva de v_me
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

    -- Perspectiva do OUTRO (espelhada). Atualidade agora refere-se ao MEU perfil.
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
    VALUES (_event_id, v_pair_a, v_pair_b, v_kind,
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

-- =====================================================================
-- 4) list_own_matches_v2 — ordenação estável, defaults explícitos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.list_own_matches_v2(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_me uuid;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT id INTO v_me FROM public.profiles
   WHERE event_id=_event_id AND owner_id=v_uid AND is_demo=false LIMIT 1;
  IF v_me IS NULL THEN RETURN '[]'::jsonb; END IF;

  WITH base AS (
    SELECT
      m.id AS match_id,
      v_me AS my_profile_id,
      (CASE WHEN m.a_profile_id = v_me THEN m.b_profile_id ELSE m.a_profile_id END) AS other_profile_id,
      m.kind, m.label,
      (CASE WHEN m.a_profile_id = v_me THEN m.score_for_a ELSE m.score_for_b END)::int AS score_me,
      (CASE WHEN m.a_profile_id = v_me THEN m.score_for_b ELSE m.score_for_a END)::int AS score_other,
      m.created_at, m.updated_at, m.generated_at,
      op.id AS op_id, op.name AS op_name, op.company AS op_company,
      op.city AS op_city, op.neighborhood AS op_neighborhood,
      op.segment_id AS op_segment, op.summary AS op_summary
    FROM public.matches m
    JOIN public.profiles op ON op.id = (CASE WHEN m.a_profile_id=v_me THEN m.b_profile_id ELSE m.a_profile_id END)
    WHERE m.event_id = _event_id
      AND m.is_active = true
      AND (m.a_profile_id = v_me OR m.b_profile_id = v_me)
  ), enriched AS (
    SELECT
      b.match_id, b.my_profile_id, b.other_profile_id, b.kind, b.label,
      b.score_me, b.score_other, b.created_at, b.updated_at, b.generated_at,
      jsonb_build_object(
        'name', b.op_name, 'company', b.op_company, 'city', b.op_city,
        'neighborhood', b.op_neighborhood, 'segment_id', b.op_segment, 'summary', b.op_summary
      ) AS other,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', po.label, 'detail', po.detail) ORDER BY po.sort_order)
          FROM public.profile_offers po WHERE po.profile_id = b.op_id AND po.active
      ), '[]'::jsonb) AS other_offers,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'label', pn.label, 'detail', pn.detail,
          'need_kind', pn.need_kind, 'is_priority', pn.is_priority
        ) ORDER BY pn.sort_order)
          FROM public.profile_needs pn WHERE pn.profile_id = b.op_id AND pn.active
      ), '[]'::jsonb) AS other_needs,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('code',mr.code,'label',mr.label,'weight',mr.weight) ORDER BY mr.weight DESC)
          FROM public.match_reasons mr
         WHERE mr.match_id = b.match_id AND mr.perspective_profile_id = v_me
      ), '[]'::jsonb) AS reasons,
      COALESCE(
        (SELECT decision FROM public.match_decisions WHERE match_id=b.match_id AND profile_id=v_me),
        'sem_decisao'::public.decision
      ) AS my_decision,
      COALESCE(
        (SELECT decision FROM public.match_decisions WHERE match_id=b.match_id AND profile_id=b.other_profile_id),
        'sem_decisao'::public.decision
      ) AS other_decision,
      (SELECT jsonb_build_object('id',c.id,'status',c.status,'notes',c.notes)
         FROM public.connections c WHERE c.match_id = b.match_id) AS connection
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.score_me DESC, e.generated_at DESC), '[]'::jsonb)
    INTO v_out
    FROM enriched e;

  RETURN v_out;
END $function$;

-- =====================================================================
-- 5) record_match_decision_v2 — variáveis tipadas, connection_created seguro,
--    mutualidade via match_decisions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.record_match_decision_v2(_match_id uuid, _decision public.decision)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_m public.matches%ROWTYPE;
  v_a_owner uuid; v_b_owner uuid;
  v_my_pid uuid; v_other_pid uuid;
  v_my_dec public.decision;
  v_other_dec public.decision;
  v_connection_id uuid := NULL;
  v_connection_status public.connection_status := NULL;
  v_created boolean := false;
  v_inserted int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_m FROM public.matches WHERE id=_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT v_m.is_active THEN RAISE EXCEPTION 'match_inactive' USING ERRCODE='P0001'; END IF;

  SELECT owner_id INTO v_a_owner FROM public.profiles WHERE id=v_m.a_profile_id;
  SELECT owner_id INTO v_b_owner FROM public.profiles WHERE id=v_m.b_profile_id;

  IF v_a_owner = v_uid THEN v_my_pid := v_m.a_profile_id; v_other_pid := v_m.b_profile_id;
  ELSIF v_b_owner = v_uid THEN v_my_pid := v_m.b_profile_id; v_other_pid := v_m.a_profile_id;
  ELSE RAISE EXCEPTION 'not_a_participant' USING ERRCODE='42501';
  END IF;

  SELECT id, status INTO v_connection_id, v_connection_status
    FROM public.connections WHERE match_id=_match_id FOR UPDATE;

  IF v_connection_id IS NOT NULL
     AND _decision = 'agora_nao'
     AND v_connection_status <> 'aguardando' THEN
    RAISE EXCEPTION 'decision_locked_by_connection' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.match_decisions(match_id, profile_id, decision)
  VALUES (_match_id, v_my_pid, _decision)
  ON CONFLICT (match_id, profile_id) DO UPDATE
    SET decision = EXCLUDED.decision, decided_at = now();

  INSERT INTO public.match_status_history(match_id, actor_user_id, actor_profile_id, event_type, payload)
  VALUES (_match_id, v_uid, v_my_pid, 'decision', jsonb_build_object('decision', _decision));

  SELECT decision INTO v_my_dec FROM public.match_decisions WHERE match_id=_match_id AND profile_id=v_my_pid;
  SELECT decision INTO v_other_dec FROM public.match_decisions WHERE match_id=_match_id AND profile_id=v_other_pid;
  v_my_dec := COALESCE(v_my_dec, 'sem_decisao'::public.decision);
  v_other_dec := COALESCE(v_other_dec, 'sem_decisao'::public.decision);

  IF v_my_dec = 'interesse' AND v_other_dec = 'interesse' AND v_connection_id IS NULL THEN
    INSERT INTO public.connections (match_id, event_id, a_profile_id, b_profile_id, status)
    VALUES (_match_id, v_m.event_id, v_m.a_profile_id, v_m.b_profile_id, 'aguardando')
    ON CONFLICT (match_id) DO NOTHING
    RETURNING id, status INTO v_connection_id, v_connection_status;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_created := (v_inserted = 1);

    IF v_connection_id IS NULL THEN
      SELECT id, status INTO v_connection_id, v_connection_status
        FROM public.connections WHERE match_id=_match_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'my_decision', v_my_dec,
    'other_decision', v_other_dec,
    'mutual', (v_my_dec='interesse' AND v_other_dec='interesse'),
    'connection_id', v_connection_id,
    'connection_status', v_connection_status,
    'connection_created', v_created
  );
END $function$;

-- =====================================================================
-- 6) save_own_profile_v2 — validações rigorosas e consent idempotente
-- =====================================================================
CREATE OR REPLACE FUNCTION public.save_own_profile_v2(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Validação de OFERTAS (labels, detail, taxonomy compatível, dedup)
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

  -- Validação de NECESSIDADES
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

  -- Upsert do perfil
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

  -- Consent: registrar linha somente quando versão/estado mudou
  SELECT * INTO v_last_consent FROM public.consents
   WHERE profile_id=v_id AND event_id=v_event AND consent_type='matchmaking'
   ORDER BY created_at DESC LIMIT 1;
  IF v_last_consent IS NULL
     OR v_last_consent.version <> v_policy_version
     OR v_last_consent.granted IS DISTINCT FROM true THEN
    INSERT INTO public.consents(profile_id, event_id, consent_type, version, granted)
    VALUES (v_id, v_event, 'matchmaking', v_policy_version, true);
  END IF;

  RETURN v_id;
END $function$;

-- =====================================================================
-- 7) recover_profile_v2 — tratar recovery ausente e escopo por evento
-- =====================================================================
CREATE OR REPLACE FUNCTION public.recover_profile_v2(_event_id text, _phone_e164 text, _code text)
RETURNS TABLE(profile_id uuid, new_recovery_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text; v_hash text; v_pid uuid; v_prev_owner uuid;
  v_is_demo boolean;
  v_locked_until timestamptz;
  v_failed_attempts int;
  v_recovery_hash text;
  v_recent int;
  v_new_code text;
  v_profile_event text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  v_norm := public.normalize_phone(_phone_e164);
  IF v_norm IS NULL OR _code IS NULL OR length(_code) < 4 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE='22023';
  END IF;
  v_hash := public.hash_phone(v_norm);

  SELECT COUNT(*) INTO v_recent FROM private.recovery_attempts
    WHERE event_id=_event_id AND phone_hash=v_hash
      AND attempted_at > now() - interval '15 minutes';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001'; END IF;

  SELECT pc.profile_id INTO v_pid FROM private.profile_contacts pc
   WHERE pc.event_id=_event_id AND pc.phone_hash=v_hash LIMIT 1;
  IF v_pid IS NULL THEN
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, false);
    RAISE EXCEPTION 'not_found' USING ERRCODE='P0001';
  END IF;

  SELECT p.owner_id, p.is_demo, p.event_id INTO v_prev_owner, v_is_demo, v_profile_event
    FROM public.profiles p WHERE p.id = v_pid FOR UPDATE;
  IF v_profile_event IS DISTINCT FROM _event_id THEN
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, false);
    RAISE EXCEPTION 'not_found' USING ERRCODE='P0001';
  END IF;
  IF v_is_demo THEN
    RAISE EXCEPTION 'demo_not_recoverable' USING ERRCODE='P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p2
              WHERE p2.event_id=_event_id AND p2.owner_id=v_uid
                AND p2.is_demo=false AND p2.id <> v_pid) THEN
    RAISE EXCEPTION 'current_user_already_has_profile' USING ERRCODE='P0001';
  END IF;

  SELECT locked_until, failed_attempts, recovery_code_hash
    INTO v_locked_until, v_failed_attempts, v_recovery_hash
    FROM private.profile_recovery WHERE profile_id=v_pid FOR UPDATE;

  IF v_recovery_hash IS NULL THEN
    RAISE EXCEPTION 'recovery_not_configured' USING ERRCODE='P0001';
  END IF;
  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION 'locked' USING ERRCODE='P0001';
  END IF;

  IF NOT public.verify_recovery_code(_code, v_recovery_hash) THEN
    UPDATE private.profile_recovery
      SET failed_attempts = failed_attempts + 1,
          locked_until = CASE WHEN failed_attempts+1 >= 5 THEN now()+interval '15 minutes' ELSE locked_until END,
          updated_at = now()
     WHERE profile_id = v_pid;
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, false);
    RAISE EXCEPTION 'invalid_code' USING ERRCODE='P0001';
  END IF;

  v_new_code := upper(substring(encode(extensions.gen_random_bytes(6),'hex') from 1 for 8));
  UPDATE private.profile_recovery
     SET recovery_code_hash = public.hash_recovery_code(v_new_code),
         code_rotated_at = now(), failed_attempts = 0, locked_until = NULL,
         last_recovered_at = now(), updated_at = now()
   WHERE profile_id = v_pid;

  INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, true);

  UPDATE public.profiles SET owner_id = v_uid, updated_at = now() WHERE id = v_pid;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'profiles', v_pid::text, 'ownership_transfer',
          jsonb_build_object('previous_owner', v_prev_owner),
          jsonb_build_object('new_owner', v_uid));

  RETURN QUERY SELECT v_pid, v_new_code;
END $function$;

-- =====================================================================
-- 8) event_stats — mutualidade via match_decisions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.event_stats(_event_id text)
RETURNS TABLE(total_profiles integer, total_matches integer, mutual_matches integer, total_connections integer, completed_connections integer, total_segments integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    (SELECT count(*)::int FROM public.profiles WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.matches WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.matches m
      WHERE m.event_id = _event_id
        AND (SELECT count(*) FROM public.match_decisions d
              WHERE d.match_id=m.id AND d.decision='interesse'
                AND d.profile_id IN (m.a_profile_id, m.b_profile_id)) = 2),
    (SELECT count(*)::int FROM public.connections WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.connections WHERE event_id = _event_id AND status='concluido'),
    (SELECT count(*)::int FROM public.segments);
$function$;

-- =====================================================================
-- 9) reveal_contact_for_match — mutualidade via match_decisions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reveal_contact_for_match(_match_id uuid)
RETURNS TABLE(phone_e164 text, email text, name text, company text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_a_pid uuid; v_b_pid uuid;
  v_a_owner uuid; v_b_owner uuid;
  v_other uuid;
  v_conn_status public.connection_status := NULL;
  v_sharing boolean; v_phone text;
  v_mutual int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT m.event_id, m.a_profile_id, m.b_profile_id
    INTO v_event_id, v_a_pid, v_b_pid
    FROM public.matches m WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;

  SELECT owner_id INTO v_a_owner FROM public.profiles WHERE id=v_a_pid;
  SELECT owner_id INTO v_b_owner FROM public.profiles WHERE id=v_b_pid;

  IF v_a_owner = v_uid THEN v_other := v_b_pid;
  ELSIF v_b_owner = v_uid THEN v_other := v_a_pid;
  ELSE RAISE EXCEPTION 'not_a_participant' USING ERRCODE='42501';
  END IF;

  SELECT count(*)::int INTO v_mutual
    FROM public.match_decisions d
   WHERE d.match_id=_match_id AND d.decision='interesse'
     AND d.profile_id IN (v_a_pid, v_b_pid);
  IF v_mutual < 2 THEN
    RAISE EXCEPTION 'not_mutual' USING ERRCODE='P0001';
  END IF;

  SELECT status INTO v_conn_status FROM public.connections WHERE match_id=_match_id;
  IF v_conn_status IS NULL OR v_conn_status NOT IN ('apresentados','contato_trocado','concluido') THEN
    RAISE EXCEPTION 'not_yet_introduced' USING ERRCODE='P0001';
  END IF;

  SELECT pc.contact_sharing_enabled, pc.phone_e164
    INTO v_sharing, v_phone
    FROM private.profile_contacts pc WHERE pc.profile_id = v_other;
  IF NOT FOUND OR v_phone IS NULL OR v_phone='' THEN
    RAISE EXCEPTION 'contact_unavailable' USING ERRCODE='P0001';
  END IF;
  IF v_sharing IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'contact_sharing_disabled' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_event_id, v_uid, 'private.profile_contacts', v_other::text, 'participant_reveal_contact');

  RETURN QUERY
    SELECT pc.phone_e164, pc.email, p.name, p.company
      FROM public.profiles p
      JOIN private.profile_contacts pc ON pc.profile_id = p.id
     WHERE p.id = v_other;
END $function$;

-- =====================================================================
-- 10) staff_reveal_contact_for_match — mutualidade via match_decisions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.staff_reveal_contact_for_match(_match_id uuid)
RETURNS TABLE(profile_id uuid, name text, company text, phone_e164 text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text; v_a_pid uuid; v_b_pid uuid;
  v_mutual int;
  v_conn_status public.connection_status := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT m.event_id, m.a_profile_id, m.b_profile_id
    INTO v_event_id, v_a_pid, v_b_pid
    FROM public.matches m WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;

  IF NOT public.has_any_event_role(v_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT count(*)::int INTO v_mutual
    FROM public.match_decisions d
   WHERE d.match_id=_match_id AND d.decision='interesse'
     AND d.profile_id IN (v_a_pid, v_b_pid);
  IF v_mutual < 2 THEN
    RAISE EXCEPTION 'not_mutual' USING ERRCODE='P0001';
  END IF;

  SELECT status INTO v_conn_status FROM public.connections WHERE match_id=_match_id;
  IF v_conn_status IS NULL THEN
    RAISE EXCEPTION 'no_connection' USING ERRCODE='P0001';
  END IF;
  IF v_conn_status = 'cancelado' THEN
    RAISE EXCEPTION 'connection_cancelled' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_event_id, v_uid, 'private.profile_contacts', _match_id::text, 'staff_reveal_contact');

  RETURN QUERY
    SELECT p.id, p.name, p.company, pc.phone_e164, pc.email
      FROM public.matches m
      JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
      LEFT JOIN private.profile_contacts pc ON pc.profile_id = p.id
     WHERE m.id = _match_id;
END $function$;

-- =====================================================================
-- 11) list_staff_connections — fila para a equipe, mutualidade via match_decisions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.list_staff_connections(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_event_role(_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.status, r.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT c.id, c.match_id, c.status, c.notes, c.assigned_to, c.created_at, c.updated_at,
             jsonb_build_object('id', pa.id, 'name', pa.name, 'company', pa.company) AS profile_a,
             jsonb_build_object('id', pb.id, 'name', pb.name, 'company', pb.company) AS profile_b,
             (SELECT count(*)::int FROM public.match_decisions d
               WHERE d.match_id=c.match_id AND d.decision='interesse'
                 AND d.profile_id IN (c.a_profile_id, c.b_profile_id)) AS interested_count
        FROM public.connections c
        JOIN public.profiles pa ON pa.id = c.a_profile_id
        JOIN public.profiles pb ON pb.id = c.b_profile_id
       WHERE c.event_id = _event_id
    ) r;

  RETURN v_out;
END $function$;

-- =====================================================================
-- Permissões (mantém o padrão: authenticated pode executar as RPCs v2)
-- =====================================================================
GRANT EXECUTE ON FUNCTION public.taxonomy_match(uuid,text,uuid,text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_own_matches_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_match_decision_v2(uuid, public.decision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_own_profile_v2(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_profile_v2(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_own_matches(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff_connections(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.event_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_stats(text) TO anon, authenticated;
