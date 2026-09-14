-- ============================================================
-- IMPL 31 HARDENING — auditoria externa (14/09/2026)
-- Achado 1: participante podia executar as RPCs internas de dossier/save.
-- Achado 2: Top 3 do banco divergia do Top 3 realmente exibido.
-- ============================================================

-- 1) Fecha acesso direto do cliente às RPCs internas da IMPL 31.
REVOKE ALL ON FUNCTION public.participant_get_match_dossier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_get_match_dossier(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.participant_get_match_dossier(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.participant_get_match_dossier(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.participant_save_match_briefing(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_save_match_briefing(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.participant_save_match_briefing(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.participant_save_match_briefing(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public._participant_match_rank(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._participant_match_rank(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public._participant_match_rank(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._participant_match_rank(uuid, uuid) TO service_role;

-- 2) Rank do participante = MESMA ordem exibida (sortMatchesByMutualInterest):
--    agora_nao ao final; Tier1 (ambos >=60 e gap<30), Tier2 (ambos >=60),
--    Tier3 (restante); Tier1/2 por menor gap, maior soma, maior score_me;
--    Tier3 por maior score_me e maior score_other; desempate final por id.
CREATE OR REPLACE FUNCTION public._participant_match_rank(_match_id uuid, _profile_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH mine AS (
    SELECT
      m.id,
      (CASE WHEN m.a_profile_id = _profile_id THEN m.score_for_a ELSE m.score_for_b END)::int AS score_me,
      (CASE WHEN m.a_profile_id = _profile_id THEN m.score_for_b ELSE m.score_for_a END)::int AS score_other,
      COALESCE(
        (SELECT d.decision::text FROM public.match_decisions d
          WHERE d.match_id = m.id AND d.profile_id = _profile_id),
        'sem_decisao'
      ) AS my_decision
    FROM public.matches m
    JOIN public.matches src ON src.id = _match_id
   WHERE m.event_id = src.event_id
     AND m.is_active = true
     AND (m.a_profile_id = _profile_id OR m.b_profile_id = _profile_id)
  ), scored AS (
    SELECT
      id, score_me, score_other,
      abs(score_me - score_other) AS gap,
      (my_decision = 'agora_nao') AS dismissed,
      CASE
        WHEN score_me >= 60 AND score_other >= 60
          THEN (CASE WHEN abs(score_me - score_other) < 30 THEN 1 ELSE 2 END)
        ELSE 3
      END AS tier
    FROM mine
  ), ranked AS (
    SELECT id, row_number() OVER (
      ORDER BY
        dismissed ASC,
        tier ASC,
        (CASE WHEN tier < 3 THEN gap ELSE 0 END) ASC,
        (CASE WHEN tier < 3 THEN -(score_me + score_other) ELSE 0 END) ASC,
        (CASE WHEN tier < 3 THEN -score_me ELSE 0 END) ASC,
        (CASE WHEN tier = 3 THEN -score_me ELSE 0 END) ASC,
        (CASE WHEN tier = 3 THEN -score_other ELSE 0 END) ASC,
        id ASC
    ) AS rnk
    FROM scored
  )
  SELECT rnk::int FROM ranked WHERE id = _match_id;
$function$;

-- 3) Ponte SERVER-ONLY: revalida ator explícito e devolve dossiê + briefing atual.
CREATE OR REPLACE FUNCTION public.service_participant_briefing_context(
  _match_id uuid,
  _actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_m public.matches;
  v_me uuid;
  v_rank int;
  v_existing jsonb;
BEGIN
  IF _actor_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_m.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'match_inactive' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id INTO v_me
    FROM public.profiles p
   WHERE p.owner_id = _actor_user_id
     AND p.is_demo = false
     AND p.event_id = v_m.event_id
     AND p.id IN (v_m.a_profile_id, v_m.b_profile_id)
   LIMIT 1;
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501'; END IF;

  v_rank := public._participant_match_rank(_match_id, v_me);
  IF v_rank IS NULL OR v_rank > 3 THEN
    RAISE EXCEPTION 'not_top_three' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
           'summary', mb.summary,
           'my_side', COALESCE(
             CASE WHEN v_m.a_profile_id = v_me THEN mb.sides->'a' ELSE mb.sides->'b' END,
             '[]'::jsonb),
           'evidence', COALESCE(mb.evidence, '[]'::jsonb),
           'approach', mb.approach,
           'generated_at', mb.generated_at,
           'stale', (mb.inputs_fingerprint IS DISTINCT FROM public._match_inputs_fingerprint(v_m.id))
         )
    INTO v_existing
    FROM public.match_briefings mb
   WHERE mb.match_id = v_m.id;

  RETURN jsonb_build_object(
    'match_id', v_m.id,
    'my_profile_id', v_me,
    'rank', v_rank,
    'existing', v_existing,
    'dossier', jsonb_build_object(
      'match', jsonb_build_object(
        'id', v_m.id,
        'event_id', v_m.event_id,
        'kind', v_m.kind,
        'algorithm_version', v_m.algorithm_version,
        'score_for_a', v_m.score_for_a,
        'score_for_b', v_m.score_for_b
      ),
      'fingerprint', public._match_inputs_fingerprint(v_m.id),
      'profile_a', public._match_dossier_profile(v_m.a_profile_id),
      'profile_b', public._match_dossier_profile(v_m.b_profile_id),
      'reasons_a', public._admin_match_reasons(v_m.id, v_m.a_profile_id),
      'reasons_b', public._admin_match_reasons(v_m.id, v_m.b_profile_id)
    )
  );
END $function$;

REVOKE ALL ON FUNCTION public.service_participant_briefing_context(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_participant_briefing_context(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.service_participant_briefing_context(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_participant_briefing_context(uuid, uuid) TO service_role;

-- 4) Ponte SERVER-ONLY de persistência: mesma revalidação, ator explícito.
CREATE OR REPLACE FUNCTION public.service_participant_save_briefing(
  _match_id uuid,
  _actor_user_id uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_m public.matches;
  v_me uuid;
  v_rank int;
  v_row public.match_briefings;
BEGIN
  IF _actor_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_m.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'match_inactive' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id INTO v_me
    FROM public.profiles p
   WHERE p.owner_id = _actor_user_id
     AND p.is_demo = false
     AND p.event_id = v_m.event_id
     AND p.id IN (v_m.a_profile_id, v_m.b_profile_id)
   LIMIT 1;
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501'; END IF;

  v_rank := public._participant_match_rank(_match_id, v_me);
  IF v_rank IS NULL OR v_rank > 3 THEN
    RAISE EXCEPTION 'not_top_three' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(btrim(_payload->>'summary'), '') = '' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.match_briefings AS b (
    match_id, event_id, summary, sides, evidence, risks, approach,
    source, model, inputs_fingerprint, generated_by, generated_at
  ) VALUES (
    v_m.id, v_m.event_id, btrim(_payload->>'summary'),
    COALESCE(_payload->'sides', '{"a":[],"b":[]}'::jsonb),
    COALESCE(_payload->'evidence', '[]'::jsonb),
    COALESCE(_payload->'risks', '[]'::jsonb),
    NULLIF(btrim(COALESCE(_payload->>'approach','')), ''),
    COALESCE(NULLIF(btrim(COALESCE(_payload->>'source','')), ''), 'ai'),
    NULLIF(btrim(COALESCE(_payload->>'model','')), ''),
    public._match_inputs_fingerprint(v_m.id),
    _actor_user_id, now()
  )
  ON CONFLICT (match_id) DO UPDATE SET
    summary = EXCLUDED.summary,
    sides = EXCLUDED.sides,
    evidence = EXCLUDED.evidence,
    risks = EXCLUDED.risks,
    approach = EXCLUDED.approach,
    source = EXCLUDED.source,
    model = EXCLUDED.model,
    inputs_fingerprint = EXCLUDED.inputs_fingerprint,
    generated_by = EXCLUDED.generated_by,
    generated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_m.event_id, _actor_user_id, 'match_briefings', v_m.id::text,
          'participant_save_match_briefing');

  RETURN jsonb_build_object(
    'match_id', v_row.match_id,
    'summary', v_row.summary,
    'my_side', COALESCE(
      CASE WHEN v_m.a_profile_id = v_me THEN v_row.sides->'a' ELSE v_row.sides->'b' END,
      '[]'::jsonb),
    'evidence', COALESCE(v_row.evidence, '[]'::jsonb),
    'approach', v_row.approach,
    'generated_at', v_row.generated_at,
    'stale', false
  );
END $function$;

REVOKE ALL ON FUNCTION public.service_participant_save_briefing(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_participant_save_briefing(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.service_participant_save_briefing(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_participant_save_briefing(uuid, uuid, jsonb) TO service_role;

-- 5) Contexto de abordagem: contagem exata de sugestões restantes e
--    preservação do interesse da contraparte em conexões já liberadas.
CREATE OR REPLACE FUNCTION public.admin_get_participant_outreach_context(_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_p public.profiles;
  v_phone text;
  v_released jsonb;
  v_incoming jsonb;
  v_active_count int;
  v_covered uuid[];
  v_other_count int;
BEGIN
  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._admin_require_event_admin(v_p.event_id);

  SELECT pc.phone_e164 INTO v_phone
    FROM private.profile_contacts pc
   WHERE pc.profile_id = v_p.id;

  -- Conexões cujo contato já está efetivamente liberado, seguindo as MESMAS
  -- regras canônicas de reveal_contact_for_match.
  WITH rel AS (
    SELECT
      c.match_id,
      c.status::text AS status,
      c.contact_released_at,
      m.is_active AS match_is_active,
      (CASE WHEN m.a_profile_id = v_p.id THEN m.b_profile_id ELSE m.a_profile_id END) AS other_profile_id,
      COALESCE(
        (SELECT d.decision::text FROM public.match_decisions d
          WHERE d.match_id = m.id AND d.profile_id = v_p.id),
        'sem_decisao'
      ) AS my_decision,
      COALESCE(
        (SELECT d.decision::text FROM public.match_decisions d
          WHERE d.match_id = m.id
            AND d.profile_id = (CASE WHEN m.a_profile_id = v_p.id THEN m.b_profile_id ELSE m.a_profile_id END)),
        'sem_decisao'
      ) AS other_decision
    FROM public.connections c
    JOIN public.matches m ON m.id = c.match_id
   WHERE m.event_id = v_p.event_id
     AND (m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id)
     AND c.status IN ('apresentados','contato_trocado','concluido')
     AND (
       c.contact_released_at IS NOT NULL
       OR (
         SELECT count(*) FROM public.match_decisions d
          WHERE d.match_id = m.id
            AND d.decision = 'interesse'
            AND d.profile_id IN (m.a_profile_id, m.b_profile_id)
       ) >= 2
     )
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'match_id', r.match_id,
      'profile_id', r.other_profile_id,
      'name', op.name,
      'company', op.company,
      'status', r.status,
      'my_decision', r.my_decision,
      'other_decision', r.other_decision,
      'other_has_interest', (r.other_decision = 'interesse')
    ) ORDER BY r.contact_released_at DESC NULLS LAST, op.name), '[]'::jsonb),
    -- Só matches ATIVOS podem descontar de active_matches_count.
    COALESCE(array_agg(r.match_id) FILTER (WHERE r.match_is_active), ARRAY[]::uuid[])
    INTO v_released, v_covered
    FROM rel r
    JOIN public.profiles op ON op.id = r.other_profile_id;

  -- Quem marcou interesse NESTE participante em match ativo (sem telefone deles).
  -- Não exclui conexões liberadas: o fato do interesse é preservado.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'match_id', t.match_id,
      'profile_id', t.other_profile_id,
      'name', t.name,
      'company', t.company
    ) ORDER BY t.name), '[]'::jsonb)
    INTO v_incoming
    FROM (
      SELECT DISTINCT
        m.id AS match_id,
        op.id AS other_profile_id,
        op.name AS name,
        op.company AS company
      FROM public.matches m
      JOIN public.profiles op
        ON op.id = (CASE WHEN m.a_profile_id = v_p.id THEN m.b_profile_id ELSE m.a_profile_id END)
      JOIN public.match_decisions d
        ON d.match_id = m.id AND d.profile_id = op.id AND d.decision = 'interesse'
     WHERE m.event_id = v_p.event_id
       AND m.is_active = true
       AND (m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id)
    ) t;

  SELECT count(*)::int INTO v_active_count
    FROM public.matches m
   WHERE m.event_id = v_p.event_id AND m.is_active = true
     AND (m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id);

  -- Sugestões que NÃO estão cobertas por interesse recebido nem por conexão
  -- liberada ativa: contagem exata, sem subtração cega.
  SELECT count(*)::int INTO v_other_count
    FROM public.matches m
   WHERE m.event_id = v_p.event_id AND m.is_active = true
     AND (m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id)
     AND NOT (m.id = ANY (v_covered))
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_incoming) inc
        WHERE (inc->>'match_id')::uuid = m.id
     );

  RETURN jsonb_build_object(
    'profile_id', v_p.id,
    'event_id', v_p.event_id,
    'name', v_p.name,
    'company', v_p.company,
    'phone_e164', v_phone,
    'active_matches_count', v_active_count,
    'other_suggestions_count', v_other_count,
    'incoming_interests', v_incoming,
    'released_connections', v_released
  );
END $function$;

REVOKE ALL ON FUNCTION public.admin_get_participant_outreach_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_participant_outreach_context(uuid) TO authenticated, service_role;