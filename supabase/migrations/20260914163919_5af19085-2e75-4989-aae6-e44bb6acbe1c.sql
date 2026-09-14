-- ============================================================
-- IMPL 31 — WhatsApp-assisted networking & Participant Briefing
-- ============================================================

-- 1) Contexto de abordagem (admin-only, sob demanda, PII mínima)
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
  v_released_match_ids uuid[];
BEGIN
  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._admin_require_event_admin(v_p.event_id);

  SELECT pc.phone_e164 INTO v_phone
    FROM private.profile_contacts pc
   WHERE pc.profile_id = v_p.id;

  -- Conexões cujo contato já está efetivamente liberado para o participante,
  -- seguindo as MESMAS regras canônicas de reveal_contact_for_match.
  WITH rel AS (
    SELECT
      c.match_id,
      c.status::text AS status,
      c.contact_released_at,
      (CASE WHEN m.a_profile_id = v_p.id THEN m.b_profile_id ELSE m.a_profile_id END) AS other_profile_id,
      COALESCE(
        (SELECT d.decision::text FROM public.match_decisions d
          WHERE d.match_id = m.id AND d.profile_id = v_p.id),
        'sem_decisao'
      ) AS my_decision
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
      'my_decision', r.my_decision
    ) ORDER BY r.contact_released_at DESC NULLS LAST, op.name), '[]'::jsonb),
    COALESCE(array_agg(r.match_id), ARRAY[]::uuid[])
    INTO v_released, v_released_match_ids
    FROM rel r
    JOIN public.profiles op ON op.id = r.other_profile_id;

  -- Quem marcou interesse NESTE participante em match ativo (sem telefone deles).
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
       AND NOT (m.id = ANY (v_released_match_ids))
    ) t;

  RETURN jsonb_build_object(
    'profile_id', v_p.id,
    'event_id', v_p.event_id,
    'name', v_p.name,
    'company', v_p.company,
    'phone_e164', v_phone,
    'active_matches_count', (
      SELECT count(*)::int FROM public.matches m
       WHERE m.event_id = v_p.event_id AND m.is_active = true
         AND (m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id)
    ),
    'incoming_interests', v_incoming,
    'released_connections', v_released
  );
END $function$;

REVOKE ALL ON FUNCTION public.admin_get_participant_outreach_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_participant_outreach_context(uuid) TO authenticated, service_role;

-- 2) Registro best-effort da abordagem participant-centric (sem telefone)
CREATE OR REPLACE FUNCTION public.admin_log_participant_outreach(
  _profile_id uuid,
  _channel text DEFAULT 'whatsapp',
  _message_preview text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p public.profiles;
  v_uid uuid;
BEGIN
  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  v_uid := public._admin_require_event_admin(v_p.event_id);

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (
    v_p.event_id, v_uid, 'profiles', v_p.id::text, 'participant_outreach',
    jsonb_build_object(
      'channel', COALESCE(NULLIF(btrim(_channel), ''), 'whatsapp'),
      'preview', left(COALESCE(_message_preview, ''), 300)
    )
  );

  INSERT INTO public.analytics_events(event_id, profile_id, actor_user_id, kind, payload)
  VALUES (
    v_p.event_id, v_p.id, v_uid, 'participant_outreach',
    jsonb_build_object('channel', COALESCE(NULLIF(btrim(_channel), ''), 'whatsapp'))
  );

  RETURN jsonb_build_object('logged_at', now());
END $function$;

REVOKE ALL ON FUNCTION public.admin_log_participant_outreach(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_log_participant_outreach(uuid, text, text) TO authenticated, service_role;

-- 3) list_own_matches_v2 passa a devolver briefing seguro por perspectiva
CREATE OR REPLACE FUNCTION public.list_own_matches_v2(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
      (m.a_profile_id = v_me) AS i_am_a,
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
      public.match_label_for_score(b.score_me) AS label_me,
      public.match_label_for_score(b.score_other) AS label_other,
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
      (SELECT jsonb_build_object(
                'id', c.id,
                'status', c.status,
                'notes', c.notes,
                'contact_released_at', c.contact_released_at)
         FROM public.connections c WHERE c.match_id = b.match_id) AS connection,
      -- Briefing oficial: SOMENTE visão segura da própria perspectiva.
      -- Nunca envia riscos internos, prompts, o lado da outra pessoa nem contatos.
      (SELECT jsonb_build_object(
                'summary', mb.summary,
                'my_side', COALESCE(
                  CASE WHEN b.i_am_a THEN mb.sides->'a' ELSE mb.sides->'b' END,
                  '[]'::jsonb),
                'evidence', COALESCE(mb.evidence, '[]'::jsonb),
                'approach', mb.approach,
                'generated_at', mb.generated_at,
                'stale', (mb.inputs_fingerprint IS DISTINCT FROM public._match_inputs_fingerprint(b.match_id))
              )
         FROM public.match_briefings mb WHERE mb.match_id = b.match_id) AS briefing
    FROM base b
  )
  SELECT COALESCE(
           jsonb_agg(to_jsonb(e) ORDER BY e.score_me DESC, e.generated_at DESC, e.match_id),
           '[]'::jsonb)
    INTO v_out
    FROM enriched e;

  RETURN v_out;
END $function$;

-- 4) Autorização participant-centric para gerar o briefing oficial
--    (dono de um dos lados + match ativo + Top 3 da ordem canônica).
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
      m.generated_at
    FROM public.matches m
    JOIN public.matches src ON src.id = _match_id
   WHERE m.event_id = src.event_id
     AND m.is_active = true
     AND (m.a_profile_id = _profile_id OR m.b_profile_id = _profile_id)
  ), ranked AS (
    SELECT id, row_number() OVER (ORDER BY score_me DESC, generated_at DESC, id) AS rnk
      FROM mine
  )
  SELECT rnk::int FROM ranked WHERE id = _match_id;
$function$;

REVOKE ALL ON FUNCTION public._participant_match_rank(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._participant_match_rank(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.participant_get_match_dossier(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_m public.matches;
  v_me uuid;
  v_rank int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0002'; END IF;
  IF v_m.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'match_inactive' USING ERRCODE='P0001';
  END IF;

  SELECT p.id INTO v_me
    FROM public.profiles p
   WHERE p.owner_id = v_uid
     AND p.is_demo = false
     AND p.id IN (v_m.a_profile_id, v_m.b_profile_id)
   LIMIT 1;
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_a_participant' USING ERRCODE='42501'; END IF;

  v_rank := public._participant_match_rank(_match_id, v_me);
  IF v_rank IS NULL OR v_rank > 3 THEN
    RAISE EXCEPTION 'not_top_three' USING ERRCODE='42501';
  END IF;

  RETURN jsonb_build_object(
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
  );
END $function$;

REVOKE ALL ON FUNCTION public.participant_get_match_dossier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_get_match_dossier(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.participant_save_match_briefing(_match_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_m public.matches;
  v_me uuid;
  v_rank int;
  v_row public.match_briefings;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0002'; END IF;
  IF v_m.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'match_inactive' USING ERRCODE='P0001';
  END IF;

  SELECT p.id INTO v_me
    FROM public.profiles p
   WHERE p.owner_id = v_uid
     AND p.is_demo = false
     AND p.id IN (v_m.a_profile_id, v_m.b_profile_id)
   LIMIT 1;
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_a_participant' USING ERRCODE='42501'; END IF;

  v_rank := public._participant_match_rank(_match_id, v_me);
  IF v_rank IS NULL OR v_rank > 3 THEN
    RAISE EXCEPTION 'not_top_three' USING ERRCODE='42501';
  END IF;

  IF COALESCE(btrim(_payload->>'summary'), '') = '' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE='22023';
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
    v_uid, now()
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
  VALUES (v_m.event_id, v_uid, 'match_briefings', v_m.id::text, 'participant_save_match_briefing');

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

REVOKE ALL ON FUNCTION public.participant_save_match_briefing(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_save_match_briefing(uuid, jsonb) TO authenticated, service_role;