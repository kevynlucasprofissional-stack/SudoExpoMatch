CREATE OR REPLACE FUNCTION public.admin_match_graph(
  _event_id text,
  _min_score integer DEFAULT NULL::integer,
  _segment_ids text[] DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_segs text[] := CASE WHEN _segment_ids IS NULL OR array_length(_segment_ids,1) IS NULL THEN NULL ELSE _segment_ids END;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_event_role(_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT m.id AS match_id,
           m.a_profile_id, m.b_profile_id,
           m.score_for_a, m.score_for_b,
           m.kind::text AS kind,
           COALESCE(da.decision::text, 'sem_decisao') AS decision_a,
           COALESCE(db.decision::text, 'sem_decisao') AS decision_b,
           c.status::text AS connection_status,
           COALESCE(r.reviewed, false) AS reviewed,
           (bf.match_id IS NOT NULL) AS has_briefing
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
        SELECT cc.status FROM public.connections cc
         WHERE cc.match_id = m.id ORDER BY cc.created_at DESC LIMIT 1
      ) c ON true
     WHERE m.event_id = _event_id
       AND m.is_active
       AND (_min_score IS NULL OR GREATEST(m.score_for_a, m.score_for_b) >= _min_score)
       AND (v_segs IS NULL OR pa.segment_id = ANY (v_segs) OR pb.segment_id = ANY (v_segs))
  ),
  edges AS (
    SELECT b.*,
           CASE
             WHEN b.decision_a = 'interesse' AND b.decision_b = 'interesse' THEN 'mutual'
             WHEN b.decision_a = 'interesse' OR b.decision_b = 'interesse' THEN 'single'
             WHEN b.decision_a = 'agora_nao' OR b.decision_b = 'agora_nao' THEN 'declined'
             ELSE 'none'
           END AS interest_state
      FROM base b
  ),
  degrees AS (
    SELECT profile_id, count(*)::int AS degree
      FROM (
        SELECT a_profile_id AS profile_id FROM edges
        UNION ALL
        SELECT b_profile_id AS profile_id FROM edges
      ) t
     GROUP BY profile_id
  ),
  nodes AS (
    SELECT p.id AS profile_id,
           p.name,
           COALESCE(p.company, '') AS company,
           p.segment_id,
           s.label AS segment_label,
           COALESCE(d.degree, 0) AS degree
      FROM public.profiles p
      LEFT JOIN degrees d ON d.profile_id = p.id
      LEFT JOIN public.segments s ON s.id = p.segment_id
     WHERE p.event_id = _event_id
  )
  SELECT jsonb_build_object(
    'event_id', _event_id,
    'nodes', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.degree DESC) FROM nodes n), '[]'::jsonb),
    'edges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'match_id', e.match_id,
        'a_profile_id', e.a_profile_id,
        'b_profile_id', e.b_profile_id,
        'score_for_a', e.score_for_a,
        'score_for_b', e.score_for_b,
        'kind', e.kind,
        'decision_a', e.decision_a,
        'decision_b', e.decision_b,
        'interest_state', e.interest_state,
        'connection_status', e.connection_status,
        'reviewed', e.reviewed,
        'has_briefing', e.has_briefing
      )) FROM edges e), '[]'::jsonb),
    'meta', jsonb_build_object(
      'nodes_total', (SELECT count(*) FROM nodes),
      'edges_total', (SELECT count(*) FROM edges),
      'mutual', (SELECT count(*) FROM edges WHERE interest_state = 'mutual'),
      'single', (SELECT count(*) FROM edges WHERE interest_state = 'single'),
      'none', (SELECT count(*) FROM edges WHERE interest_state = 'none'),
      'declined', (SELECT count(*) FROM edges WHERE interest_state = 'declined')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_match_graph(text, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_graph(text, integer, text[]) TO authenticated;