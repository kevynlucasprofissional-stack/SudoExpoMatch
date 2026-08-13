-- IMPL 10/12 — Auditoria administrativa de matches (READ-ONLY).
-- Duas RPCs admin-only, SECURITY DEFINER, isolamento por evento, sem PII.
-- Regras: label SEMPRE por perspectiva (match_label_for_score), decisões SEMPRE
-- de public.match_decisions (nunca matches.decision_a/b).

CREATE OR REPLACE FUNCTION public.admin_list_matches(
  _event_id text,
  _search text DEFAULT NULL,
  _kinds text[] DEFAULT NULL,
  _labels text[] DEFAULT NULL,
  _score_side text DEFAULT 'any',      -- 'any' | 'a' | 'b' | 'both'
  _min_score integer DEFAULT NULL,
  _max_score integer DEFAULT NULL,
  _segment_ids text[] DEFAULT NULL,
  _decisions text[] DEFAULT NULL,      -- decisão presente em QUALQUER lado
  _mutual_only boolean DEFAULT false,
  _connection text DEFAULT 'any',      -- 'any' | 'with' | 'without'
  _connection_statuses text[] DEFAULT NULL,
  _algorithm_versions text[] DEFAULT NULL,
  _sort text DEFAULT 'score_desc',     -- 'score_desc' | 'score_asc' | 'gap_desc' | 'recent'
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
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
           pb.name AS b_name, pb.company AS b_company, pb.segment_id AS b_segment_id,
           COALESCE(da.decision::text, 'sem_decisao') AS decision_a,
           COALESCE(db.decision::text, 'sem_decisao') AS decision_b,
           c.id AS connection_id, c.status::text AS connection_status
      FROM public.matches m
      JOIN public.profiles pa ON pa.id = m.a_profile_id
      JOIN public.profiles pb ON pb.id = m.b_profile_id
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
           'a_segment_id', p.a_segment_id,
           'a_segment_label', COALESCE(p.a_segment_label, p.a_segment_id),
           'b_profile_id', p.b_profile_id,
           'b_name', p.b_name,
           'b_company', p.b_company,
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
           'generated_at', p.generated_at,
           'updated_at', p.updated_at
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
    'sort', v_sort
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_matches(text,text,text[],text[],text,integer,integer,text[],text[],boolean,text,text[],text[],text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_matches(text,text,text[],text[],text,integer,integer,text[],text[],boolean,text,text[],text[],text,integer,integer) TO authenticated;

COMMENT ON FUNCTION public.admin_list_matches(text,text,text[],text[],text,integer,integer,text[],text[],boolean,text,text[],text[],text,integer,integer) IS
'IMPL 10 — auditoria read-only de matches. Admin do evento apenas. label_a/label_b derivam de match_label_for_score por perspectiva (nunca matches.label). decision_a/b vêm de match_decisions (nunca matches.decision_a/b). score_side define se faixa/classificação valem para A, B, ambos ou qualquer lado.';

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
        'summary', p.summary, 'is_demo', p.is_demo, 'updated_at', p.updated_at)
        FROM public.profiles p LEFT JOIN public.segments s ON s.id = p.segment_id
       WHERE p.id = v_m.a_profile_id),
    'profile_b', (
      SELECT jsonb_build_object(
        'id', p.id, 'name', p.name, 'company', p.company, 'city', p.city,
        'segment_id', p.segment_id,
        'segment_label', COALESCE(s.label, p.segment_id),
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
    'reasons_b', public._admin_match_reasons(v_m.id, v_m.b_profile_id)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Helper interno: motivos de UMA perspectiva, com enriquecimento auditável
-- (need/offer atuais + estado ATUAL da relation) sem N+1: joins laterais únicos.
CREATE OR REPLACE FUNCTION public._admin_match_reasons(_match_id uuid, _perspective uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'label', r.label,
    'weight', r.weight,
    'is_complement', (r.taxonomy_relation_id IS NOT NULL
                      OR r.profile_need_id IS NOT NULL
                      OR r.profile_offer_id IS NOT NULL),
    'profile_need_id', r.profile_need_id,
    'profile_offer_id', r.profile_offer_id,
    'taxonomy_relation_id', r.taxonomy_relation_id,
    'relation_weight', r.relation_weight,
    -- histórico: texto congelado no momento em que o match foi gerado
    'rationale_historic', r.rationale,
    'need', CASE WHEN n.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', n.id, 'label', n.label, 'detail', n.detail,
      'need_kind', n.need_kind, 'is_priority', n.is_priority,
      'segment_id', n.segment_id, 'active', n.active) END,
    'offer', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', o.id, 'label', o.label, 'detail', o.detail,
      'segment_id', o.segment_id, 'active', o.active) END,
    -- estado ATUAL da relação (pode ter mudado desde a geração do match)
    'relation_current', CASE WHEN rel.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', rel.id,
      'relation_type', rel.relation_type,
      'weight', rel.weight,
      'active', rel.active,
      'rationale_current', rel.rationale,
      'from_item_id', fi.id, 'from_item_label', fi.label,
      'from_item_segment_id', fi.segment_id, 'from_item_active', fi.active,
      'to_item_id', ti.id, 'to_item_label', ti.label,
      'to_item_segment_id', ti.segment_id, 'to_item_active', ti.active,
      'updated_at', rel.updated_at) END,
    'created_at', r.created_at
  ) ORDER BY r.weight DESC, r.created_at, r.id), '[]'::jsonb)
  FROM public.match_reasons r
  LEFT JOIN public.profile_needs n ON n.id = r.profile_need_id
  LEFT JOIN public.profile_offers o ON o.id = r.profile_offer_id
  LEFT JOIN public.taxonomy_relations rel ON rel.id = r.taxonomy_relation_id
  LEFT JOIN public.taxonomy_items fi ON fi.id = rel.from_taxonomy_item_id
  LEFT JOIN public.taxonomy_items ti ON ti.id = rel.to_taxonomy_item_id
 WHERE r.match_id = _match_id AND r.perspective_profile_id = _perspective;
$function$;

REVOKE ALL ON FUNCTION public._admin_match_reasons(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_match_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_match_detail(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_get_match_detail(uuid) IS
'IMPL 10 — detalhe read-only de um match para admin do evento. Sem PII. Reasons complementares trazem need/offer e o estado ATUAL da relation (relation_current) além do rationale_historic gravado no match.';
