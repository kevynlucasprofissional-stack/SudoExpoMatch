-- =====================================================================
-- SudoExpo Intelligence — camada de leitura admin-only (somente leitura).
-- Nenhuma alteração no matcher, pesos, reasons ou decisões históricas.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._intel_score_bucket(_score integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _score IS NULL THEN 'desconhecido'
    WHEN _score < 20 THEN '0-19'
    WHEN _score < 40 THEN '20-39'
    WHEN _score < 60 THEN '40-59'
    WHEN _score < 75 THEN '60-74'
    ELSE '75+'
  END
$$;

-- ---------------------------------------------------------------------
-- 1) Visão Geral
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_intelligence_overview(_event_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb;
BEGIN
  PERFORM public._admin_require_event_admin(_event_id);

  WITH prof AS (
    SELECT p.id FROM public.profiles p
     WHERE p.event_id = _event_id AND p.is_demo = false
  ),
  m AS (
    SELECT * FROM public.matches WHERE event_id = _event_id AND is_active
  ),
  d AS (
    SELECT dd.profile_id, dd.match_id, dd.decision::text AS decision, dd.decided_at,
           m.generated_at,
           CASE WHEN dd.profile_id = m.a_profile_id THEN m.score_for_a ELSE m.score_for_b END AS score
      FROM public.match_decisions dd
      JOIN m ON m.id = dd.match_id
     WHERE dd.decision::text <> 'sem_decisao'
       AND dd.profile_id IN (m.a_profile_id, m.b_profile_id)
  ),
  pd AS (
    SELECT profile_id, count(*)::int AS n,
           count(*) FILTER (WHERE decision = 'interesse')::int AS ni,
           count(*) FILTER (WHERE decision = 'agora_nao')::int AS nn
      FROM d GROUP BY 1
  ),
  coh AS (
    SELECT profile_id, n, ni,
           (ni > 0 AND nn > 0) AS selective,
           (n >= 5 AND ni = n) AS permissive_strong
      FROM pd
  ),
  dc AS (
    SELECT d.*, coh.selective, coh.permissive_strong
      FROM d JOIN coh ON coh.profile_id = d.profile_id
  ),
  buckets AS (
    SELECT public._intel_score_bucket(score) AS bucket,
           count(*)::int AS decisions,
           count(*) FILTER (WHERE decision = 'interesse')::int AS interests,
           count(*) FILTER (WHERE selective)::int AS selective_decisions,
           count(*) FILTER (WHERE selective AND decision = 'interesse')::int AS selective_interests
      FROM dc GROUP BY 1
  ),
  needs AS (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE n.taxonomy_item_id IS NOT NULL)::int AS canonical
      FROM public.profile_needs n WHERE n.event_id = _event_id AND n.active
  ),
  offers AS (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE o.taxonomy_item_id IS NOT NULL)::int AS canonical
      FROM public.profile_offers o WHERE o.event_id = _event_id AND o.active
  ),
  conns AS (SELECT * FROM public.connections WHERE event_id = _event_id),
  oc AS (
    SELECT COALESCE(e.metadata->>'outcome_kind', replace(e.action, 'outcome:', '')) AS kind,
           e.connection_id
      FROM public.connection_events e
     WHERE e.event_id = _event_id AND e.action LIKE 'outcome:%'
  ),
  mutual AS (
    SELECT m.id FROM m
     WHERE (SELECT count(DISTINCT dd.profile_id) FROM public.match_decisions dd
             WHERE dd.match_id = m.id AND dd.decision::text = 'interesse'
               AND dd.profile_id IN (m.a_profile_id, m.b_profile_id)) >= 2
  )
  SELECT jsonb_build_object(
    'event_id', _event_id,
    'generated_at', now(),
    'participants_active', (SELECT count(*) FROM prof),
    'matches_active', (SELECT count(*) FROM m),
    'algorithm_versions', COALESCE((SELECT jsonb_object_agg(av, c) FROM (
        SELECT algorithm_version AS av, count(*)::int AS c FROM m GROUP BY 1) t), '{}'::jsonb),
    'decisions_total', (SELECT count(*) FROM d),
    'participants_with_decision', (SELECT count(*) FROM pd),
    'interests', (SELECT count(*) FROM d WHERE decision = 'interesse'),
    'declines', (SELECT count(*) FROM d WHERE decision = 'agora_nao'),
    'mutual_matches', (SELECT count(*) FROM mutual),
    'selective_participants', (SELECT count(*) FROM coh WHERE selective),
    'permissive_strong_participants', (SELECT count(*) FROM coh WHERE permissive_strong),
    'selective_high', jsonb_build_object(
      'decisions', (SELECT count(*) FROM dc WHERE selective AND score >= 60),
      'interests', (SELECT count(*) FROM dc WHERE selective AND score >= 60 AND decision = 'interesse')),
    'selective_low', jsonb_build_object(
      'decisions', (SELECT count(*) FROM dc WHERE selective AND score < 40),
      'interests', (SELECT count(*) FROM dc WHERE selective AND score < 40 AND decision = 'interesse')),
    'low_score_interests', jsonb_build_object(
      'total', (SELECT count(*) FROM dc WHERE score < 40 AND decision = 'interesse'),
      'permissive_strong', (SELECT count(*) FROM dc WHERE score < 40 AND decision = 'interesse' AND permissive_strong),
      'selective', (SELECT count(*) FROM dc WHERE score < 40 AND decision = 'interesse' AND selective),
      'other', (SELECT count(*) FROM dc WHERE score < 40 AND decision = 'interesse' AND NOT selective AND NOT permissive_strong)),
    'score_buckets', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket, 'decisions', decisions, 'interests', interests,
        'selective_decisions', selective_decisions, 'selective_interests', selective_interests)
      ORDER BY bucket) FROM buckets), '[]'::jsonb),
    'taxonomy', jsonb_build_object(
      'needs_total', (SELECT total FROM needs), 'needs_canonical', (SELECT canonical FROM needs),
      'offers_total', (SELECT total FROM offers), 'offers_canonical', (SELECT canonical FROM offers)),
    'snapshot', jsonb_build_object(
      'decisions', (SELECT count(*) FROM d),
      'drift', (SELECT count(*) FROM d WHERE generated_at > decided_at),
      'unknown', (SELECT count(*) FROM d WHERE generated_at IS NULL OR decided_at IS NULL)),
    'connections', jsonb_build_object(
      'total', (SELECT count(*) FROM conns),
      'by_status', COALESCE((SELECT jsonb_object_agg(st, c) FROM (
          SELECT status::text AS st, count(*)::int AS c FROM conns GROUP BY 1) t), '{}'::jsonb),
      'offline', (SELECT count(*) FROM public.offline_connections WHERE event_id = _event_id)),
    'outcomes', jsonb_build_object(
      'by_kind', COALESCE((SELECT jsonb_object_agg(kind, c) FROM (
          SELECT kind, count(*)::int AS c FROM oc GROUP BY 1) t), '{}'::jsonb),
      'total', (SELECT count(*) FROM oc),
      'connections_with_outcome', (SELECT count(DISTINCT connection_id) FROM oc))
  ) INTO v;

  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 2) Matcher Lab
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_intelligence_matcher(_event_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb;
BEGIN
  PERFORM public._admin_require_event_admin(_event_id);

  WITH m AS (SELECT * FROM public.matches WHERE event_id = _event_id AND is_active),
  mutual AS (
    SELECT m.id FROM m
     WHERE (SELECT count(DISTINCT dd.profile_id) FROM public.match_decisions dd
             WHERE dd.match_id = m.id AND dd.decision::text = 'interesse'
               AND dd.profile_id IN (m.a_profile_id, m.b_profile_id)) >= 2
  ),
  conn AS (SELECT match_id, id, status::text AS status FROM public.connections WHERE event_id = _event_id),
  strong AS (
    SELECT DISTINCT e.connection_id FROM public.connection_events e
     WHERE e.event_id = _event_id AND e.action LIKE 'outcome:%'
  ),
  matrix AS (
    SELECT public._intel_score_bucket(m.score_for_a) AS bucket_a,
           public._intel_score_bucket(m.score_for_b) AS bucket_b,
           count(*)::int AS matches,
           count(*) FILTER (WHERE mu.id IS NOT NULL)::int AS mutual,
           count(*) FILTER (WHERE c.id IS NOT NULL)::int AS connections
      FROM m
      LEFT JOIN mutual mu ON mu.id = m.id
      LEFT JOIN conn c ON c.match_id = m.id
     GROUP BY 1, 2
  ),
  d AS (
    SELECT dd.profile_id, dd.match_id, dd.decision::text AS decision,
           CASE WHEN dd.profile_id = m.a_profile_id THEN m.score_for_a ELSE m.score_for_b END AS score,
           m.kind::text AS kind
      FROM public.match_decisions dd
      JOIN m ON m.id = dd.match_id
     WHERE dd.decision::text <> 'sem_decisao'
       AND dd.profile_id IN (m.a_profile_id, m.b_profile_id)
  ),
  pd AS (
    SELECT profile_id,
           count(*) FILTER (WHERE decision = 'interesse')::int AS ni,
           count(*) FILTER (WHERE decision = 'agora_nao')::int AS nn
      FROM d GROUP BY 1
  ),
  dc AS (
    SELECT d.*, (pd.ni > 0 AND pd.nn > 0) AS selective
      FROM d JOIN pd ON pd.profile_id = d.profile_id
  ),
  codes AS (SELECT DISTINCT r.code FROM public.match_reasons r JOIN m ON m.id = r.match_id),
  dr AS (
    SELECT dc.decision, dc.selective, c.code,
           EXISTS (SELECT 1 FROM public.match_reasons r
                    WHERE r.match_id = dc.match_id
                      AND r.perspective_profile_id = dc.profile_id
                      AND r.code = c.code) AS has_reason
      FROM dc CROSS JOIN codes c
  ),
  lift AS (
    SELECT code,
           count(*) FILTER (WHERE has_reason)::int AS n_with,
           count(*) FILTER (WHERE has_reason AND decision = 'interesse')::int AS i_with,
           count(*) FILTER (WHERE NOT has_reason)::int AS n_without,
           count(*) FILTER (WHERE NOT has_reason AND decision = 'interesse')::int AS i_without,
           count(*) FILTER (WHERE has_reason AND selective)::int AS sel_n_with,
           count(*) FILTER (WHERE has_reason AND selective AND decision = 'interesse')::int AS sel_i_with,
           count(*) FILTER (WHERE NOT has_reason AND selective)::int AS sel_n_without,
           count(*) FILTER (WHERE NOT has_reason AND selective AND decision = 'interesse')::int AS sel_i_without
      FROM dr GROUP BY 1
  ),
  kinds AS (
    SELECT kind,
           count(*)::int AS decisions,
           count(*) FILTER (WHERE decision = 'interesse')::int AS interests,
           count(*) FILTER (WHERE selective)::int AS selective_decisions,
           count(*) FILTER (WHERE selective AND decision = 'interesse')::int AS selective_interests
      FROM dc GROUP BY 1
  ),
  kind_volume AS (SELECT kind::text AS kind, count(*)::int AS matches FROM m GROUP BY 1),
  residual AS (
    SELECT dc.match_id, dc.profile_id, dc.score, dc.kind,
           (mu.id IS NOT NULL) AS mutual,
           c.status AS connection_status,
           (s.connection_id IS NOT NULL) AS strong_outcome
      FROM dc
      LEFT JOIN mutual mu ON mu.id = dc.match_id
      LEFT JOIN conn c ON c.match_id = dc.match_id
      LEFT JOIN strong s ON s.connection_id = c.id
     WHERE dc.score < 40 AND dc.decision = 'interesse' AND dc.selective
  )
  SELECT jsonb_build_object(
    'event_id', _event_id,
    'generated_at', now(),
    'matches_active', (SELECT count(*) FROM m),
    'score_matrix', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'bucket_a', bucket_a, 'bucket_b', bucket_b, 'matches', matches,
        'mutual', mutual, 'connections', connections) ORDER BY bucket_a, bucket_b)
      FROM matrix), '[]'::jsonb),
    'reason_lift', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'code', code,
        'n_with', n_with, 'interests_with', i_with,
        'n_without', n_without, 'interests_without', i_without,
        'selective_n_with', sel_n_with, 'selective_interests_with', sel_i_with,
        'selective_n_without', sel_n_without, 'selective_interests_without', sel_i_without)
      ORDER BY code) FROM lift), '[]'::jsonb),
    'kinds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'kind', kv.kind, 'matches', kv.matches,
        'decisions', COALESCE(k.decisions, 0), 'interests', COALESCE(k.interests, 0),
        'selective_decisions', COALESCE(k.selective_decisions, 0),
        'selective_interests', COALESCE(k.selective_interests, 0))
      ORDER BY kv.matches DESC)
      FROM kind_volume kv LEFT JOIN kinds k ON k.kind = kv.kind), '[]'::jsonb),
    'residuals', jsonb_build_object(
      'total', (SELECT count(*) FROM residual),
      'mutual', (SELECT count(*) FROM residual WHERE mutual),
      'with_connection', (SELECT count(*) FROM residual WHERE connection_status IS NOT NULL),
      'with_strong_outcome', (SELECT count(*) FROM residual WHERE strong_outcome),
      'sample', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object(
            'match_id', r.match_id, 'profile_id', r.profile_id, 'profile_name', p.name,
            'company', p.company, 'score', r.score, 'kind', r.kind, 'mutual', r.mutual,
            'connection_status', r.connection_status, 'strong_outcome', r.strong_outcome) AS x
            FROM residual r JOIN public.profiles p ON p.id = r.profile_id
           ORDER BY r.score ASC LIMIT 25) s), '[]'::jsonb))
  ) INTO v;

  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 3) Behavior Lab
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_intelligence_behavior(_event_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb;
BEGIN
  PERFORM public._admin_require_event_admin(_event_id);

  WITH m AS (SELECT * FROM public.matches WHERE event_id = _event_id AND is_active),
  d AS (
    SELECT dd.profile_id, dd.decision::text AS decision,
           CASE WHEN dd.profile_id = m.a_profile_id THEN m.score_for_a ELSE m.score_for_b END AS score
      FROM public.match_decisions dd
      JOIN m ON m.id = dd.match_id
     WHERE dd.decision::text <> 'sem_decisao'
       AND dd.profile_id IN (m.a_profile_id, m.b_profile_id)
  ),
  pd AS (
    SELECT d.profile_id,
           count(*)::int AS decisions,
           count(*) FILTER (WHERE decision = 'interesse')::int AS interests,
           count(*) FILTER (WHERE decision = 'agora_nao')::int AS declines,
           avg(score) FILTER (WHERE decision = 'interesse') AS avg_accepted_score
      FROM d GROUP BY 1
  ),
  pc AS (
    SELECT pd.*, p.name, p.company, p.segment_id,
           round((pd.interests::numeric / NULLIF(pd.decisions, 0)) * 100, 1) AS propensity_pct,
           (pd.interests > 0 AND pd.declines > 0) AS selective,
           (pd.decisions >= 5 AND pd.interests = pd.decisions) AS permissive_strong,
           (pd.decisions < 5 AND pd.interests = pd.decisions) AS all_interest_small_sample
      FROM pd JOIN public.profiles p ON p.id = pd.profile_id
  ),
  hist AS (
    SELECT CASE
             WHEN propensity_pct < 10 THEN '0-10%'
             WHEN propensity_pct < 25 THEN '10-25%'
             WHEN propensity_pct < 50 THEN '25-50%'
             WHEN propensity_pct < 75 THEN '50-75%'
             WHEN propensity_pct < 90 THEN '75-90%'
             ELSE '90-100%'
           END AS bucket,
           count(*)::int AS participants,
           sum(decisions)::int AS decisions
      FROM pc GROUP BY 1
  )
  SELECT jsonb_build_object(
    'event_id', _event_id,
    'generated_at', now(),
    'participants_with_decision', (SELECT count(*) FROM pc),
    'selective', (SELECT count(*) FROM pc WHERE selective),
    'permissive_strong', (SELECT count(*) FROM pc WHERE permissive_strong),
    'all_interest_small_sample', (SELECT count(*) FROM pc WHERE all_interest_small_sample),
    'decisions_total', (SELECT COALESCE(sum(decisions), 0) FROM pc),
    'propensity_histogram', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket, 'participants', participants, 'decisions', decisions) ORDER BY bucket)
      FROM hist), '[]'::jsonb),
    'participants', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object(
          'profile_id', profile_id, 'name', name, 'company', COALESCE(company, ''),
          'segment_id', segment_id, 'decisions', decisions, 'interests', interests,
          'declines', declines, 'propensity_pct', propensity_pct,
          'avg_accepted_score', CASE WHEN avg_accepted_score IS NULL THEN NULL
                                     ELSE round(avg_accepted_score, 1) END,
          'selective', selective, 'permissive_strong', permissive_strong,
          'all_interest_small_sample', all_interest_small_sample) AS x
          FROM pc ORDER BY decisions DESC, propensity_pct DESC LIMIT 200) s), '[]'::jsonb)
  ) INTO v;

  RETURN v;
END $fn$;

-- ---------------------------------------------------------------------
-- 4) Taxonomy Intelligence
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_intelligence_taxonomy(_event_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb;
BEGIN
  PERFORM public._admin_require_event_admin(_event_id);

  WITH items AS (
    SELECT 'need'::text AS side, n.id, n.profile_id, n.segment_id, n.source,
           n.taxonomy_item_id, n.label
      FROM public.profile_needs n WHERE n.event_id = _event_id AND n.active
    UNION ALL
    SELECT 'offer'::text, o.id, o.profile_id, o.segment_id, o.source,
           o.taxonomy_item_id, o.label
      FROM public.profile_offers o WHERE o.event_id = _event_id AND o.active
  ),
  by_side AS (
    SELECT side, count(*)::int AS total,
           count(*) FILTER (WHERE taxonomy_item_id IS NOT NULL)::int AS canonical
      FROM items GROUP BY 1
  ),
  by_source AS (
    SELECT COALESCE(source, 'desconhecido') AS source, side, count(*)::int AS total,
           count(*) FILTER (WHERE taxonomy_item_id IS NOT NULL)::int AS canonical
      FROM items GROUP BY 1, 2
  ),
  by_segment AS (
    SELECT COALESCE(i.segment_id, 'sem_segmento') AS segment_id,
           max(s.label) AS segment_label,
           count(*)::int AS total,
           count(*) FILTER (WHERE i.taxonomy_item_id IS NOT NULL)::int AS canonical
      FROM items i LEFT JOIN public.segments s ON s.id = i.segment_id
     GROUP BY 1
  ),
  free AS (
    SELECT public.norm_label(label) AS norm,
           min(label) AS sample_label,
           side,
           count(*)::int AS frequency,
           count(DISTINCT profile_id)::int AS participants
      FROM items WHERE taxonomy_item_id IS NULL AND COALESCE(label, '') <> ''
     GROUP BY 1, 3
  )
  SELECT jsonb_build_object(
    'event_id', _event_id,
    'generated_at', now(),
    'coverage', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'side', side, 'total', total, 'canonical', canonical) ORDER BY side) FROM by_side), '[]'::jsonb),
    'by_source', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'source', source, 'side', side, 'total', total, 'canonical', canonical)
      ORDER BY total DESC) FROM by_source), '[]'::jsonb),
    'by_segment', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'segment_id', segment_id, 'segment_label', segment_label,
        'total', total, 'canonical', canonical) ORDER BY total DESC) FROM by_segment), '[]'::jsonb),
    'free_text_top', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object(
          'norm', norm, 'label', sample_label, 'side', side,
          'frequency', frequency, 'participants', participants,
          'observed_opportunity', frequency * participants) AS x
          FROM free ORDER BY (frequency * participants) DESC, frequency DESC LIMIT 40) s), '[]'::jsonb),
    'taxonomy_items_active', (SELECT count(*) FROM public.taxonomy_items WHERE active),
    'taxonomy_relations_active', (SELECT count(*) FROM public.taxonomy_relations WHERE active)
  ) INTO v;

  RETURN v;
END $fn$;

-- Grants: admin-only por dentro da função; execução apenas para autenticados.
REVOKE ALL ON FUNCTION public._intel_score_bucket(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_intelligence_overview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_intelligence_matcher(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_intelligence_behavior(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_intelligence_taxonomy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._intel_score_bucket(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_intelligence_overview(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_intelligence_matcher(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_intelligence_behavior(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_intelligence_taxonomy(text) TO authenticated, service_role;