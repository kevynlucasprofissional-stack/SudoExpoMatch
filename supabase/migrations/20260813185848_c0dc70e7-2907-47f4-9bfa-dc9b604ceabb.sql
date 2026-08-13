CREATE OR REPLACE FUNCTION public._recompute_matches_for_profile(p_profile_id uuid, p_event_id text)
 RETURNS integer
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
  v_comp_me int;
  v_comp_other int;
  v_comp_pts_me int;
  v_comp_pts_other int;
  v_comp_min_weight CONSTANT int := 40;
  v_comp_max_pts CONSTANT int := 30;
  v_now timestamptz := now();
  v_algo text := 'v2.3';
BEGIN
  SELECT id, segment_id, city, updated_at
    INTO v_me, v_my_segment, v_my_city, v_my_updated_at
    FROM public.profiles
   WHERE id = p_profile_id AND event_id = p_event_id
   FOR UPDATE;
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0001';
  END IF;

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

    -- v2.3: complementaridade direcional via taxonomy_relations.
    SELECT COALESCE(MAX(r.weight), 0)::int INTO v_comp_me
      FROM public.taxonomy_relations r
     WHERE r.active
       AND r.relation_type = 'complements'
       AND EXISTS (
         SELECT 1 FROM public.profile_needs mn
          WHERE mn.profile_id = v_me AND mn.active
            AND mn.taxonomy_item_id = r.from_taxonomy_item_id)
       AND EXISTS (
         SELECT 1 FROM public.profile_offers oo
          WHERE oo.profile_id = v_other.id AND oo.active
            AND oo.taxonomy_item_id = r.to_taxonomy_item_id);

    SELECT COALESCE(MAX(r.weight), 0)::int INTO v_comp_other
      FROM public.taxonomy_relations r
     WHERE r.active
       AND r.relation_type = 'complements'
       AND EXISTS (
         SELECT 1 FROM public.profile_needs no_
          WHERE no_.profile_id = v_other.id AND no_.active
            AND no_.taxonomy_item_id = r.from_taxonomy_item_id)
       AND EXISTS (
         SELECT 1 FROM public.profile_offers mo
          WHERE mo.profile_id = v_me AND mo.active
            AND mo.taxonomy_item_id = r.to_taxonomy_item_id);

    IF v_comp_me < v_comp_min_weight THEN v_comp_me := 0; END IF;
    IF v_comp_other < v_comp_min_weight THEN v_comp_other := 0; END IF;

    v_comp_pts_me := CASE WHEN v_comp_me = 0 THEN 0
                          ELSE LEAST(v_comp_max_pts, round(v_comp_me * 0.30)::int) END;
    v_comp_pts_other := CASE WHEN v_comp_other = 0 THEN 0
                             ELSE LEAST(v_comp_max_pts, round(v_comp_other * 0.30)::int) END;

    v_score_me := 0; v_reasons_me := '[]'::jsonb; v_signal := false;
    IF v_overlap_offers_needs > 0 THEN
      v_score_me := v_score_me + 55; v_signal := true;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','outro_oferece_o_que_procuro','weight',55,'label','O outro oferece o que você procura');
    END IF;
    IF v_overlap_needs_offers > 0 THEN
      v_score_me := v_score_me + 25; v_signal := true;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','outro_procura_o_que_ofereco','weight',25,'label','O outro procura o que você oferece');
    END IF;
    IF v_comp_pts_me > 0 THEN
      v_score_me := v_score_me + v_comp_pts_me; v_signal := true;
      v_reasons_me := v_reasons_me || jsonb_build_object(
        'code','relacao_complementar','weight',v_comp_pts_me,
        'label','A oferta do outro é complementar ao que você procura',
        'rationale', format('relacao complementar de taxonomia (forca %s/100)', v_comp_me));
    END IF;
    -- Simetria de descoberta: sinal complementar a favor do outro tambem cria a dupla.
    IF v_comp_pts_other > 0 THEN
      v_signal := true;
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
    IF v_comp_pts_other > 0 THEN
      v_score_other := v_score_other + v_comp_pts_other;
      v_reasons_other := v_reasons_other || jsonb_build_object(
        'code','relacao_complementar','weight',v_comp_pts_other,
        'label','A oferta do outro é complementar ao que você procura',
        'rationale', format('relacao complementar de taxonomia (forca %s/100)', v_comp_other));
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
      v_algo, true, v_now)
    ON CONFLICT (event_id, a_profile_id, b_profile_id) DO UPDATE
      SET kind = EXCLUDED.kind,
          score_for_a = EXCLUDED.score_for_a,
          score_for_b = EXCLUDED.score_for_b,
          label = EXCLUDED.label,
          reasons_for_a = EXCLUDED.reasons_for_a,
          reasons_for_b = EXCLUDED.reasons_for_b,
          is_active = true,
          generated_at = v_now,
          algorithm_version = v_algo,
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

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (p_event_id, NULL, 'matches', p_profile_id::text, 'auto_recompute',
          jsonb_build_object('count', v_count, 'algorithm_version', v_algo));

  RETURN v_count;
END $function$;

COMMENT ON FUNCTION public._recompute_matches_for_profile(uuid, text) IS
'Matcher v2.3. Pesos literais preservados (55/25/10/5/3/2). Complementaridade direcional via taxonomy_relations (relation_type=complements, active): perspectiva "me" usa minha necessidade (from) -> oferta do outro (to); perspectiva do outro usa necessidade dele (from) -> minha oferta (to). Agregacao MAX(weight) sobre relacoes distintas (sem double count). Threshold: weight >= 40. Pontos = LEAST(30, round(weight*0.30)) => 12..30. Sinal complementar de qualquer perspectiva gera match kind=complementar; kinds literais (direto/inverso/bidirecional/hibrido) tem precedencia.';