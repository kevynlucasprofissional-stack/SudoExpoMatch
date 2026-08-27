-- 1) Briefings persistidos por match
CREATE TABLE public.match_briefings (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id),
  summary text NOT NULL,
  sides jsonb NOT NULL DEFAULT '{"a":[],"b":[]}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  approach text,
  source text NOT NULL DEFAULT 'ai',
  model text,
  inputs_fingerprint text,
  generated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.match_briefings TO authenticated;
GRANT ALL ON public.match_briefings TO service_role;

ALTER TABLE public.match_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe do evento le briefings"
  ON public.match_briefings FOR SELECT
  TO authenticated
  USING (public.has_any_event_role(event_id, auth.uid()));

CREATE TRIGGER match_briefings_set_updated_at
  BEFORE UPDATE ON public.match_briefings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX match_briefings_event_idx ON public.match_briefings(event_id);

-- 2) Fingerprint das entradas: marca briefing desatualizado
CREATE OR REPLACE FUNCTION public._match_inputs_fingerprint(_match_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT md5(concat_ws('|',
    m.updated_at::text,
    m.score_for_a::text,
    m.score_for_b::text,
    m.kind::text,
    m.algorithm_version,
    pa.updated_at::text,
    pb.updated_at::text,
    (SELECT count(*)::text FROM public.match_reasons r WHERE r.match_id = m.id),
    (SELECT COALESCE(max(r.created_at)::text,'') FROM public.match_reasons r WHERE r.match_id = m.id)
  ))
  FROM public.matches m
  JOIN public.profiles pa ON pa.id = m.a_profile_id
  JOIN public.profiles pb ON pb.id = m.b_profile_id
  WHERE m.id = _match_id;
$$;

REVOKE ALL ON FUNCTION public._match_inputs_fingerprint(uuid) FROM PUBLIC, anon, authenticated;

-- 3) Dossiê completo para a IA (equipe ou admin do evento)
CREATE OR REPLACE FUNCTION public.admin_get_match_dossier(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m public.matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_any_event_role(v_m.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
END $$;

REVOKE ALL ON FUNCTION public.admin_get_match_dossier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_match_dossier(uuid) TO authenticated;

-- 3b) Perfil enriquecido usado pelo dossiê (sem qualquer dado de contato)
CREATE OR REPLACE FUNCTION public._match_dossier_profile(_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p public.profiles;
  v_link private.profile_social_profiles;
  v_cache private.social_profile_cache;
BEGIN
  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_link FROM private.profile_social_profiles
   WHERE profile_id = v_p.id AND network = 'instagram';
  IF v_link.id IS NOT NULL THEN
    SELECT * INTO v_cache FROM private.social_profile_cache WHERE id = v_link.social_cache_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_p.id,
    'name', v_p.name,
    'company', v_p.company,
    'city', v_p.city,
    'neighborhood', v_p.neighborhood,
    'summary', v_p.summary,
    'segment_id', v_p.segment_id,
    'segment_label', (SELECT s.label FROM public.segments s WHERE s.id = v_p.segment_id),
    'business_size', v_p.business_size,
    'business_type', v_p.business_type,
    'niche', v_p.niche,
    'target_business_size', v_p.target_business_size,
    'target_business_type', v_p.target_business_type,
    'target_segment_id', v_p.target_segment_id,
    'target_segment_label', (SELECT s.label FROM public.segments s WHERE s.id = v_p.target_segment_id),
    'updated_at', v_p.updated_at,
    'offers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('label', o.label, 'detail', o.detail) ORDER BY o.sort_order)
        FROM public.profile_offers o WHERE o.profile_id = v_p.id AND o.active), '[]'::jsonb),
    'needs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'label', n.label, 'detail', n.detail,
               'need_kind', n.need_kind, 'is_priority', n.is_priority) ORDER BY n.sort_order)
        FROM public.profile_needs n WHERE n.profile_id = v_p.id AND n.active), '[]'::jsonb),
    'social', CASE WHEN v_link.id IS NULL THEN NULL ELSE jsonb_build_object(
      'network', v_link.network,
      'handle', v_link.normalized_handle,
      'analysis', v_link.analysis_snapshot,
      'context', v_link.context_snapshot,
      'updated_at', v_link.updated_at
    ) END
  );
END $$;

REVOKE ALL ON FUNCTION public._match_dossier_profile(uuid) FROM PUBLIC, anon, authenticated;

-- 4) Persistência do briefing gerado
CREATE OR REPLACE FUNCTION public.admin_save_match_briefing(_match_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m public.matches;
  v_row public.match_briefings;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_any_event_role(v_m.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
  VALUES (v_m.event_id, v_uid, 'match_briefings', v_m.id::text, 'save_match_briefing');

  RETURN jsonb_build_object(
    'match_id', v_row.match_id,
    'summary', v_row.summary,
    'sides', v_row.sides,
    'evidence', v_row.evidence,
    'risks', v_row.risks,
    'approach', v_row.approach,
    'source', v_row.source,
    'model', v_row.model,
    'generated_at', v_row.generated_at,
    'stale', false
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_save_match_briefing(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_match_briefing(uuid, jsonb) TO authenticated;

-- 5) Sinais compactos por perspectiva (top motivos) para a lista
CREATE OR REPLACE FUNCTION public._match_top_reasons(_match_id uuid, _perspective uuid, _limit integer DEFAULT 2)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'weight')::int DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
             'code', r.code,
             'label', r.label,
             'weight', r.weight,
             'need_label', (SELECT n.label FROM public.profile_needs n WHERE n.id = r.profile_need_id),
             'offer_label', (SELECT o.label FROM public.profile_offers o WHERE o.id = r.profile_offer_id)
           ) AS x
      FROM public.match_reasons r
     WHERE r.match_id = _match_id AND r.perspective_profile_id = _perspective
     ORDER BY r.weight DESC
     LIMIT GREATEST(COALESCE(_limit, 2), 1)
  ) t;
$$;

REVOKE ALL ON FUNCTION public._match_top_reasons(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

-- 6) Lista de matches: sinais + briefing
CREATE OR REPLACE FUNCTION public.admin_list_matches(_event_id text, _search text DEFAULT NULL::text, _kinds text[] DEFAULT NULL::text[], _labels text[] DEFAULT NULL::text[], _score_side text DEFAULT 'any'::text, _min_score integer DEFAULT NULL::integer, _max_score integer DEFAULT NULL::integer, _segment_ids text[] DEFAULT NULL::text[], _decisions text[] DEFAULT NULL::text[], _mutual_only boolean DEFAULT false, _connection text DEFAULT 'any'::text, _connection_statuses text[] DEFAULT NULL::text[], _algorithm_versions text[] DEFAULT NULL::text[], _sort text DEFAULT 'score_desc'::text, _limit integer DEFAULT 20, _offset integer DEFAULT 0, _reviewed boolean DEFAULT NULL::boolean, _briefing text DEFAULT 'any'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(_limit, 20), 1), 100);
  v_offset int := GREATEST(COALESCE(_offset, 0), 0);
  v_search text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_pattern text;
  v_side text := lower(COALESCE(NULLIF(btrim(_score_side), ''), 'any'));
  v_conn text := lower(COALESCE(NULLIF(btrim(_connection), ''), 'any'));
  v_sort text := lower(COALESCE(NULLIF(btrim(_sort), ''), 'score_desc'));
  v_brief text := lower(COALESCE(NULLIF(btrim(_briefing), ''), 'any'));
  v_kinds text[] := CASE WHEN _kinds IS NULL OR array_length(_kinds,1) IS NULL THEN NULL ELSE _kinds END;
  v_labels text[] := CASE WHEN _labels IS NULL OR array_length(_labels,1) IS NULL THEN NULL ELSE _labels END;
  v_segs text[] := CASE WHEN _segment_ids IS NULL OR array_length(_segment_ids,1) IS NULL THEN NULL ELSE _segment_ids END;
  v_decs text[] := CASE WHEN _decisions IS NULL OR array_length(_decisions,1) IS NULL THEN NULL ELSE _decisions END;
  v_cstat text[] := CASE WHEN _connection_statuses IS NULL OR array_length(_connection_statuses,1) IS NULL THEN NULL ELSE _connection_statuses END;
  v_vers text[] := CASE WHEN _algorithm_versions IS NULL OR array_length(_algorithm_versions,1) IS NULL THEN NULL ELSE _algorithm_versions END;
  v_total int;
  v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_event_role(_event_id, v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_side NOT IN ('any','a','b','both') THEN v_side := 'any'; END IF;
  IF v_conn NOT IN ('any','with','without') THEN v_conn := 'any'; END IF;
  IF v_sort NOT IN ('score_desc','score_asc','gap_desc','recent') THEN v_sort := 'score_desc'; END IF;
  IF v_brief NOT IN ('any','with','without') THEN v_brief := 'any'; END IF;

  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH base AS (
    SELECT m.id, m.event_id, m.kind::text AS kind, m.algorithm_version,
           m.score_for_a, m.score_for_b, m.generated_at, m.updated_at,
           m.a_profile_id, m.b_profile_id,
           public.match_label_for_score(m.score_for_a)::text AS label_a,
           public.match_label_for_score(m.score_for_b)::text AS label_b,
           GREATEST(m.score_for_a, m.score_for_b) AS score_max,
           abs(m.score_for_a - m.score_for_b) AS score_gap,
           pa.name AS a_name, pa.company AS a_company, pa.segment_id AS a_segment_id,
           pa.city AS a_city,
           pb.name AS b_name, pb.company AS b_company, pb.segment_id AS b_segment_id,
           pb.city AS b_city,
           COALESCE(da.decision::text, 'sem_decisao') AS decision_a,
           COALESCE(db.decision::text, 'sem_decisao') AS decision_b,
           c.id AS connection_id, c.status::text AS connection_status,
           COALESCE(r.reviewed, false) AS reviewed,
           CASE WHEN COALESCE(r.reviewed, false) THEN r.reviewed_at END AS reviewed_at,
           CASE WHEN COALESCE(r.reviewed, false) THEN r.reviewed_by END AS reviewed_by,
           bf.summary AS briefing_summary,
           bf.generated_at AS briefing_generated_at,
           (bf.match_id IS NOT NULL) AS has_briefing,
           (bf.match_id IS NOT NULL
              AND bf.inputs_fingerprint IS DISTINCT FROM public._match_inputs_fingerprint(m.id)) AS briefing_stale
      FROM public.matches m
      JOIN public.profiles pa ON pa.id = m.a_profile_id
      JOIN public.profiles pb ON pb.id = m.b_profile_id
      LEFT JOIN public.match_admin_reviews r ON r.match_id = m.id
      LEFT JOIN public.match_briefings bf ON bf.match_id = m.id
      LEFT JOIN LATERAL (
        SELECT d.decision FROM public.match_decisions d
         WHERE d.match_id = m.id AND d.profile_id = m.a_profile_id
         ORDER BY d.decided_at DESC LIMIT 1
      ) da ON true
      LEFT JOIN LATERAL (
        SELECT d.decision FROM public.match_decisions d
         WHERE d.match_id = m.id AND d.profile_id = m.b_profile_id
         ORDER BY d.decided_at DESC LIMIT 1
      ) db ON true
      LEFT JOIN LATERAL (
        SELECT cc.id, cc.status FROM public.connections cc
         WHERE cc.match_id = m.id ORDER BY cc.created_at DESC LIMIT 1
      ) c ON true
     WHERE m.event_id = _event_id
       AND m.is_active
  ),
  filtered AS (
    SELECT b.*, (b.decision_a = 'interesse' AND b.decision_b = 'interesse') AS mutual
      FROM base b
     WHERE (v_pattern IS NULL
            OR b.a_name ILIKE v_pattern OR b.a_company ILIKE v_pattern
            OR b.b_name ILIKE v_pattern OR b.b_company ILIKE v_pattern)
       AND (v_kinds IS NULL OR b.kind = ANY (v_kinds))
       AND (v_vers IS NULL OR b.algorithm_version = ANY (v_vers))
       AND (v_segs IS NULL OR b.a_segment_id = ANY (v_segs) OR b.b_segment_id = ANY (v_segs))
       AND (v_labels IS NULL OR CASE v_side
              WHEN 'a' THEN b.label_a = ANY (v_labels)
              WHEN 'b' THEN b.label_b = ANY (v_labels)
              WHEN 'both' THEN b.label_a = ANY (v_labels) AND b.label_b = ANY (v_labels)
              ELSE b.label_a = ANY (v_labels) OR b.label_b = ANY (v_labels) END)
       AND (_min_score IS NULL OR CASE v_side
              WHEN 'a' THEN b.score_for_a >= _min_score
              WHEN 'b' THEN b.score_for_b >= _min_score
              WHEN 'both' THEN b.score_for_a >= _min_score AND b.score_for_b >= _min_score
              ELSE GREATEST(b.score_for_a, b.score_for_b) >= _min_score END)
       AND (_max_score IS NULL OR CASE v_side
              WHEN 'a' THEN b.score_for_a <= _max_score
              WHEN 'b' THEN b.score_for_b <= _max_score
              WHEN 'both' THEN b.score_for_a <= _max_score AND b.score_for_b <= _max_score
              ELSE LEAST(b.score_for_a, b.score_for_b) <= _max_score END)
       AND (v_decs IS NULL OR b.decision_a = ANY (v_decs) OR b.decision_b = ANY (v_decs))
       AND (NOT COALESCE(_mutual_only, false)
            OR (b.decision_a = 'interesse' AND b.decision_b = 'interesse'))
       AND (v_conn = 'any'
            OR (v_conn = 'with' AND b.connection_id IS NOT NULL)
            OR (v_conn = 'without' AND b.connection_id IS NULL))
       AND (v_cstat IS NULL OR b.connection_status = ANY (v_cstat))
       AND (_reviewed IS NULL OR b.reviewed = _reviewed)
       AND (v_brief = 'any'
            OR (v_brief = 'with' AND b.has_briefing)
            OR (v_brief = 'without' AND NOT b.has_briefing))
  ),
  counted AS (SELECT count(*)::int AS total FROM filtered),
  page AS (
    SELECT f.*, sa.label AS a_segment_label, sb.label AS b_segment_label
      FROM filtered f
      LEFT JOIN public.segments sa ON sa.id = f.a_segment_id
      LEFT JOIN public.segments sb ON sb.id = f.b_segment_id
     ORDER BY
       CASE WHEN v_sort = 'score_desc' THEN f.score_max END DESC NULLS LAST,
       CASE WHEN v_sort = 'score_asc' THEN f.score_max END ASC NULLS LAST,
       CASE WHEN v_sort = 'gap_desc' THEN f.score_gap END DESC NULLS LAST,
       CASE WHEN v_sort = 'recent' THEN f.generated_at END DESC NULLS LAST,
       f.generated_at DESC, f.id
     LIMIT v_limit OFFSET v_offset
  )
  SELECT (SELECT total FROM counted),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'event_id', p.event_id,
           'kind', p.kind,
           'algorithm_version', p.algorithm_version,
           'a_profile_id', p.a_profile_id,
           'a_name', p.a_name,
           'a_company', p.a_company,
           'a_city', p.a_city,
           'a_segment_id', p.a_segment_id,
           'a_segment_label', COALESCE(p.a_segment_label, p.a_segment_id),
           'b_profile_id', p.b_profile_id,
           'b_name', p.b_name,
           'b_company', p.b_company,
           'b_city', p.b_city,
           'b_segment_id', p.b_segment_id,
           'b_segment_label', COALESCE(p.b_segment_label, p.b_segment_id),
           'score_for_a', p.score_for_a,
           'label_a', p.label_a,
           'score_for_b', p.score_for_b,
           'label_b', p.label_b,
           'score_gap', p.score_gap,
           'decision_a', p.decision_a,
           'decision_b', p.decision_b,
           'mutual', p.mutual,
           'connection_id', p.connection_id,
           'connection_status', p.connection_status,
           'reviewed', p.reviewed,
           'reviewed_at', p.reviewed_at,
           'reviewed_by', p.reviewed_by,
           'generated_at', p.generated_at,
           'updated_at', p.updated_at,
           'why_a', public._match_top_reasons(p.id, p.a_profile_id, 2),
           'why_b', public._match_top_reasons(p.id, p.b_profile_id, 2),
           'has_briefing', p.has_briefing,
           'briefing_summary', p.briefing_summary,
           'briefing_generated_at', p.briefing_generated_at,
           'briefing_stale', COALESCE(p.briefing_stale, false)
         ) ORDER BY
           CASE WHEN v_sort = 'score_desc' THEN p.score_max END DESC NULLS LAST,
           CASE WHEN v_sort = 'score_asc' THEN p.score_max END ASC NULLS LAST,
           CASE WHEN v_sort = 'gap_desc' THEN p.score_gap END DESC NULLS LAST,
           CASE WHEN v_sort = 'recent' THEN p.generated_at END DESC NULLS LAST,
           p.generated_at DESC, p.id), '[]'::jsonb)
    INTO v_total, v_items
    FROM page p;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'limit', v_limit,
    'offset', v_offset,
    'score_side', v_side,
    'sort', v_sort,
    'reviewed_filter', _reviewed,
    'briefing_filter', v_brief
  );
END;
$function$;

-- 7) Detalhe do match: perfis completos + briefing salvo
CREATE OR REPLACE FUNCTION public.admin_get_match_detail(_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_m record;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT m.* INTO v_m FROM public.matches m WHERE m.id = _match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_event_role(v_m.event_id, v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'match', jsonb_build_object(
      'id', v_m.id,
      'event_id', v_m.event_id,
      'kind', v_m.kind,
      'algorithm_version', v_m.algorithm_version,
      'is_active', v_m.is_active,
      'score_for_a', v_m.score_for_a,
      'label_a', public.match_label_for_score(v_m.score_for_a),
      'score_for_b', v_m.score_for_b,
      'label_b', public.match_label_for_score(v_m.score_for_b),
      'score_gap', abs(v_m.score_for_a - v_m.score_for_b),
      'decision_a', COALESCE((
        SELECT d.decision::text FROM public.match_decisions d
         WHERE d.match_id = v_m.id AND d.profile_id = v_m.a_profile_id
         ORDER BY d.decided_at DESC LIMIT 1), 'sem_decisao'),
      'decision_b', COALESCE((
        SELECT d.decision::text FROM public.match_decisions d
         WHERE d.match_id = v_m.id AND d.profile_id = v_m.b_profile_id
         ORDER BY d.decided_at DESC LIMIT 1), 'sem_decisao'),
      'mutual', (
        COALESCE((SELECT d.decision::text FROM public.match_decisions d
                   WHERE d.match_id = v_m.id AND d.profile_id = v_m.a_profile_id
                   ORDER BY d.decided_at DESC LIMIT 1), 'x') = 'interesse'
        AND
        COALESCE((SELECT d.decision::text FROM public.match_decisions d
                   WHERE d.match_id = v_m.id AND d.profile_id = v_m.b_profile_id
                   ORDER BY d.decided_at DESC LIMIT 1), 'x') = 'interesse'),
      'generated_at', v_m.generated_at,
      'updated_at', v_m.updated_at
    ),
    'profile_a', (
      SELECT jsonb_build_object(
        'id', p.id, 'name', p.name, 'company', p.company, 'city', p.city,
        'segment_id', p.segment_id,
        'segment_label', COALESCE(s.label, p.segment_id),
        'business_size', p.business_size,
        'business_type', p.business_type,
        'niche', p.niche,
        'target_business_size', p.target_business_size,
        'target_business_type', p.target_business_type,
        'target_segment_id', p.target_segment_id,
        'target_segment_label', (SELECT ts.label FROM public.segments ts WHERE ts.id = p.target_segment_id),
        'summary', p.summary, 'is_demo', p.is_demo, 'updated_at', p.updated_at)
        FROM public.profiles p LEFT JOIN public.segments s ON s.id = p.segment_id
       WHERE p.id = v_m.a_profile_id),
    'profile_b', (
      SELECT jsonb_build_object(
        'id', p.id, 'name', p.name, 'company', p.company, 'city', p.city,
        'segment_id', p.segment_id,
        'segment_label', COALESCE(s.label, p.segment_id),
        'business_size', p.business_size,
        'business_type', p.business_type,
        'niche', p.niche,
        'target_business_size', p.target_business_size,
        'target_business_type', p.target_business_type,
        'target_segment_id', p.target_segment_id,
        'target_segment_label', (SELECT ts.label FROM public.segments ts WHERE ts.id = p.target_segment_id),
        'summary', p.summary, 'is_demo', p.is_demo, 'updated_at', p.updated_at)
        FROM public.profiles p LEFT JOIN public.segments s ON s.id = p.segment_id
       WHERE p.id = v_m.b_profile_id),
    'connection', (
      SELECT jsonb_build_object(
        'id', c.id, 'status', c.status, 'assigned_to', c.assigned_to,
        'created_at', c.created_at, 'updated_at', c.updated_at,
        'presented_at', c.presented_at, 'contact_exchanged_at', c.contact_exchanged_at,
        'completed_at', c.completed_at, 'cancelled_at', c.cancelled_at)
        FROM public.connections c WHERE c.match_id = v_m.id
       ORDER BY c.created_at DESC LIMIT 1),
    'reasons_a', public._admin_match_reasons(v_m.id, v_m.a_profile_id),
    'reasons_b', public._admin_match_reasons(v_m.id, v_m.b_profile_id),
    'briefing', (
      SELECT jsonb_build_object(
        'match_id', bf.match_id,
        'summary', bf.summary,
        'sides', bf.sides,
        'evidence', bf.evidence,
        'risks', bf.risks,
        'approach', bf.approach,
        'source', bf.source,
        'model', bf.model,
        'generated_at', bf.generated_at,
        'stale', bf.inputs_fingerprint IS DISTINCT FROM public._match_inputs_fingerprint(v_m.id))
        FROM public.match_briefings bf WHERE bf.match_id = v_m.id)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;