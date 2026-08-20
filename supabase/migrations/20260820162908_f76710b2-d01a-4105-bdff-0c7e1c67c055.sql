-- Governança humana: revisão administrativa de match. Deliberadamente FORA de
-- match_decisions e sem qualquer efeito sobre o matcher.
CREATE TABLE IF NOT EXISTS public.match_admin_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id),
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_admin_reviews_event_idx
  ON public.match_admin_reviews (event_id, reviewed);

-- Acesso apenas via RPC SECURITY DEFINER: nenhum grant para anon/authenticated.
GRANT ALL ON public.match_admin_reviews TO service_role;
ALTER TABLE public.match_admin_reviews ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_match_admin_reviews_updated_at ON public.match_admin_reviews;
CREATE TRIGGER set_match_admin_reviews_updated_at
  BEFORE UPDATE ON public.match_admin_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Marca/desmarca a revisão. Admin do MESMO evento, idempotente, auditada.
CREATE OR REPLACE FUNCTION public.admin_set_match_reviewed(
  _event_id text,
  _match_id uuid,
  _reviewed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._admin_require_event_admin(_event_id);
  v_target boolean := COALESCE(_reviewed, false);
  v_before boolean;
  v_at timestamptz;
  v_by uuid;
BEGIN
  IF _match_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
     WHERE m.id = _match_id AND m.event_id = _event_id
  ) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.reviewed INTO v_before
    FROM public.match_admin_reviews r WHERE r.match_id = _match_id;

  INSERT INTO public.match_admin_reviews (match_id, event_id, reviewed, reviewed_by, reviewed_at)
  VALUES (
    _match_id, _event_id, v_target,
    CASE WHEN v_target THEN v_uid ELSE NULL END,
    CASE WHEN v_target THEN now() ELSE NULL END
  )
  ON CONFLICT (match_id) DO UPDATE
    SET reviewed = EXCLUDED.reviewed,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = EXCLUDED.reviewed_at,
        updated_at = now()
  RETURNING reviewed_at, reviewed_by INTO v_at, v_by;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (
    _event_id, v_uid, 'match_admin_reviews', _match_id::text,
    CASE WHEN v_target THEN 'match_review_set' ELSE 'match_review_cleared' END,
    jsonb_build_object('reviewed', COALESCE(v_before, false)),
    jsonb_build_object('reviewed', v_target)
  );

  RETURN jsonb_build_object(
    'match_id', _match_id,
    'reviewed', v_target,
    'reviewed_at', v_at,
    'reviewed_by', v_by
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_match_reviewed(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_match_reviewed(text, uuid, boolean) TO authenticated;

-- admin_list_matches: acrescenta reviewed/reviewed_at/reviewed_by e o filtro
-- _reviewed (NULL = todos, true = revisados, false = não revisados).
DROP FUNCTION IF EXISTS public.admin_list_matches(text, text, text[], text[], text, integer, integer, text[], text[], boolean, text, text[], text[], text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_matches(
  _event_id text,
  _search text DEFAULT NULL::text,
  _kinds text[] DEFAULT NULL::text[],
  _labels text[] DEFAULT NULL::text[],
  _score_side text DEFAULT 'any'::text,
  _min_score integer DEFAULT NULL::integer,
  _max_score integer DEFAULT NULL::integer,
  _segment_ids text[] DEFAULT NULL::text[],
  _decisions text[] DEFAULT NULL::text[],
  _mutual_only boolean DEFAULT false,
  _connection text DEFAULT 'any'::text,
  _connection_statuses text[] DEFAULT NULL::text[],
  _algorithm_versions text[] DEFAULT NULL::text[],
  _sort text DEFAULT 'score_desc'::text,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0,
  _reviewed boolean DEFAULT NULL::boolean
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
           c.id AS connection_id, c.status::text AS connection_status,
           COALESCE(r.reviewed, false) AS reviewed,
           CASE WHEN COALESCE(r.reviewed, false) THEN r.reviewed_at END AS reviewed_at,
           CASE WHEN COALESCE(r.reviewed, false) THEN r.reviewed_by END AS reviewed_by
      FROM public.matches m
      JOIN public.profiles pa ON pa.id = m.a_profile_id
      JOIN public.profiles pb ON pb.id = m.b_profile_id
      LEFT JOIN public.match_admin_reviews r ON r.match_id = m.id
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
           'reviewed', p.reviewed,
           'reviewed_at', p.reviewed_at,
           'reviewed_by', p.reviewed_by,
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
    'sort', v_sort,
    'reviewed_filter', _reviewed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_matches(text, text, text[], text[], text, integer, integer, text[], text[], boolean, text, text[], text[], text, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_matches(text, text, text[], text[], text, integer, integer, text[], text[], boolean, text, text[], text[], text, integer, integer, boolean) TO authenticated;